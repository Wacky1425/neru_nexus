import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite/sqflite.dart';

/// R5 local-first persistence.
///
/// API GET snapshots and pending mutations live in SQLite so they survive
/// process death and ordinary `flutter run` / app restarts. SharedPreferences
/// is read once only to migrate the earlier R5 prototype data.
class OfflineSyncStore {
  const OfflineSyncStore._();

  static const _dbName = 'neru_nexus_local_v1.db';
  static const _legacyQueueKey = 'r5_offline_mutation_queue_v1';
  static const _legacyCachePrefix = 'r5_get_cache_v1:';
  static const _migrationKey = 'r5_sqlite_migrated_v1';

  static Database? _db;

  static final ValueNotifier<int> pendingCount = ValueNotifier<int>(0);
  static final ValueNotifier<int> needsAttentionCount = ValueNotifier<int>(0);
  static final ValueNotifier<bool> syncing = ValueNotifier<bool>(false);
  static final ValueNotifier<String> lastError = ValueNotifier<String>('');
  static final ValueNotifier<DateTime?> lastSyncAt = ValueNotifier<DateTime?>(null);

  static Future<void> initialize() async {
    await _database();
    await _migrateLegacyPreferences();
    await _refreshState();
  }

  static Future<Database> _database() async {
    final existing = _db;
    if (existing != null) return existing;
    final dbPath = p.join(await getDatabasesPath(), _dbName);
    final opened = await openDatabase(
      dbPath,
      version: 2,
      onCreate: (db, _) async {
        await db.execute('''
          CREATE TABLE api_cache (
            request_key TEXT PRIMARY KEY,
            data_json TEXT NOT NULL,
            saved_at TEXT NOT NULL
          )
        ''');
        await db.execute('''
          CREATE TABLE sync_queue (
            id TEXT PRIMARY KEY,
            action TEXT NOT NULL,
            body_json TEXT NOT NULL,
            queued_at TEXT NOT NULL,
            attempt_count INTEGER NOT NULL DEFAULT 0,
            last_error TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending'
          )
        ''');
        await db.execute('''
          CREATE TABLE local_meta (
            meta_key TEXT PRIMARY KEY,
            meta_value TEXT NOT NULL
          )
        ''');
      },
      onUpgrade: (db, oldVersion, newVersion) async {
        if (oldVersion < 2) {
          await db.execute("ALTER TABLE sync_queue ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'");
        }
      },
    );
    _db = opened;
    return opened;
  }

  static Future<void> cacheGet(String requestKey, Map<String, dynamic> data) async {
    final db = await _database();
    await db.insert(
      'api_cache',
      {
        'request_key': requestKey,
        'data_json': jsonEncode(data),
        'saved_at': DateTime.now().toIso8601String(),
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  static Future<Map<String, dynamic>?> readCachedGet(String requestKey) async {
    final db = await _database();
    final rows = await db.query(
      'api_cache',
      columns: ['data_json'],
      where: 'request_key = ?',
      whereArgs: [requestKey],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    try {
      final decoded = jsonDecode(rows.first['data_json']?.toString() ?? '');
      return decoded is Map ? Map<String, dynamic>.from(decoded) : null;
    } catch (_) {
      return null;
    }
  }

  static Future<bool> hasAnyCache() async {
    final db = await _database();
    final rows = await db.rawQuery('SELECT 1 FROM api_cache LIMIT 1');
    return rows.isNotEmpty;
  }

  static Future<void> enqueue(String action, Map<String, dynamic> body) async {
    final db = await _database();
    final now = DateTime.now();
    await db.insert('sync_queue', {
      'id': '${now.microsecondsSinceEpoch}-$action',
      'action': action,
      'body_json': jsonEncode(body),
      'queued_at': now.toIso8601String(),
      'attempt_count': 0,
      'last_error': '',
      'status': 'pending',
    });
    await _refreshState();
  }

  static Future<List<Map<String, dynamic>>> pendingMutations() async {
    final db = await _database();
    final rows = await db.query('sync_queue', orderBy: 'queued_at ASC');
    return rows.map(_queueRowToMutation).toList();
  }

  static Future<void> flush(
    Future<void> Function(String action, Map<String, dynamic> body) sender,
  ) async {
    if (syncing.value) return;
    syncing.value = true;
    lastError.value = '';
    try {
      final db = await _database();
      while (true) {
        final rows = await db.query(
          'sync_queue',
          where: "status != 'needs_attention'",
          orderBy: 'queued_at ASC',
          limit: 1,
        );
        if (rows.isEmpty) break;
        final row = rows.first;
        final id = row['id']?.toString() ?? '';
        final action = row['action']?.toString() ?? '';
        Map<String, dynamic> body = const {};
        try {
          final decoded = jsonDecode(row['body_json']?.toString() ?? '{}');
          if (decoded is Map) body = Map<String, dynamic>.from(decoded);
          await sender(action, body);
          // Delete by the stable queue id only after the server accepted it.
          await db.delete('sync_queue', where: 'id = ?', whereArgs: [id]);
          await _setLastSyncAt(DateTime.now());
          await _refreshState();
        } catch (error) {
          final message = error.toString().replaceFirst('Exception: ', '');
          lastError.value = message;
          final needsAttention = error is SyncNeedsAttentionException;
          await db.update(
            'sync_queue',
            {
              'attempt_count': ((row['attempt_count'] as num?)?.toInt() ?? 0) + 1,
              'last_error': message,
              'status': needsAttention ? 'needs_attention' : 'pending',
            },
            where: 'id = ?',
            whereArgs: [id],
          );
          await _refreshState();
          // A bad mutation must not block later valid mutations. Transport
          // failures stop here because the following items would fail too.
          if (!needsAttention) break;
        }
      }
    } finally {
      syncing.value = false;
      await _refreshState();
    }
  }

  static Future<List<Map<String, dynamic>>> applyTransactionOverlays(
    List<Map<String, dynamic>> serverItems,
  ) async {
    final result = serverItems.map((e) => Map<String, dynamic>.from(e)).toList();
    final queue = await pendingMutations();
    for (final mutation in queue) {
      final action = mutation['action']?.toString() ?? '';
      final body = Map<String, dynamic>.from(mutation['body'] as Map? ?? const {});
      final id = body['id']?.toString() ?? '';
      if (action == 'transaction_update' && id.isNotEmpty) {
        final index = result.indexWhere((e) => e['id']?.toString() == id);
        if (index >= 0) result[index] = {...result[index], ...body, 'offlinePending': true};
      } else if (action == 'transaction_create') {
        result.add({
          ...body,
          'id': 'offline-${mutation['id']}',
          'itemName': body['title'] ?? '',
          'note': body['memo'] ?? '',
          'sourceType': 'Neru Nexus App',
          'sourceStatus': 'offline_pending',
          'offlinePending': true,
        });
      } else if (action == 'transaction_delete' && id.isNotEmpty) {
        result.removeWhere((e) => e['id']?.toString() == id);
      }
    }
    return result;
  }

  static Map<String, dynamic> _queueRowToMutation(Map<String, Object?> row) {
    Map<String, dynamic> body = const {};
    try {
      final decoded = jsonDecode(row['body_json']?.toString() ?? '{}');
      if (decoded is Map) body = Map<String, dynamic>.from(decoded);
    } catch (_) {}
    return {
      'id': row['id']?.toString() ?? '',
      'action': row['action']?.toString() ?? '',
      'body': body,
      'queuedAt': row['queued_at']?.toString() ?? '',
      'attemptCount': (row['attempt_count'] as num?)?.toInt() ?? 0,
      'lastError': row['last_error']?.toString() ?? '',
      'status': row['status']?.toString() ?? 'pending',
    };
  }

  static Future<void> retryMutation(String id) async {
    final db = await _database();
    await db.update(
      'sync_queue',
      {'status': 'pending', 'last_error': ''},
      where: 'id = ?',
      whereArgs: [id],
    );
    lastError.value = '';
    await _refreshState();
  }

  static Future<void> discardMutation(String id) async {
    final db = await _database();
    await db.delete('sync_queue', where: 'id = ?', whereArgs: [id]);
    await _refreshState();
  }

  static Future<void> _setLastSyncAt(DateTime value) async {
    final db = await _database();
    await db.insert(
      'local_meta',
      {'meta_key': 'last_sync_at', 'meta_value': value.toIso8601String()},
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
    lastSyncAt.value = value;
  }

  static Future<void> _refreshState() async {
    final db = await _database();
    final count = Sqflite.firstIntValue(await db.rawQuery('SELECT COUNT(*) FROM sync_queue')) ?? 0;
    pendingCount.value = count;
    final attention = Sqflite.firstIntValue(await db.rawQuery("SELECT COUNT(*) FROM sync_queue WHERE status = 'needs_attention'")) ?? 0;
    needsAttentionCount.value = attention;
    final rows = await db.query(
      'local_meta',
      columns: ['meta_value'],
      where: 'meta_key = ?',
      whereArgs: ['last_sync_at'],
      limit: 1,
    );
    if (rows.isNotEmpty) {
      lastSyncAt.value = DateTime.tryParse(rows.first['meta_value']?.toString() ?? '');
    }
  }

  static Future<void> _migrateLegacyPreferences() async {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(_migrationKey) == true) return;
    final db = await _database();

    final rawQueue = prefs.getString(_legacyQueueKey);
    if (rawQueue != null && rawQueue.isNotEmpty) {
      try {
        final decoded = jsonDecode(rawQueue);
        if (decoded is List) {
          for (final raw in decoded.whereType<Map>()) {
            final item = Map<String, dynamic>.from(raw);
            await db.insert(
              'sync_queue',
              {
                'id': item['id']?.toString() ?? '${DateTime.now().microsecondsSinceEpoch}-legacy',
                'action': item['action']?.toString() ?? '',
                'body_json': jsonEncode(item['body'] is Map ? item['body'] : const {}),
                'queued_at': item['queuedAt']?.toString() ?? DateTime.now().toIso8601String(),
                'attempt_count': 0,
                'last_error': '',
                'status': 'pending',
              },
              conflictAlgorithm: ConflictAlgorithm.ignore,
            );
          }
        }
      } catch (_) {}
    }

    for (final key in prefs.getKeys().where((k) => k.startsWith(_legacyCachePrefix))) {
      final raw = prefs.getString(key);
      if (raw == null || raw.isEmpty) continue;
      try {
        final decoded = jsonDecode(raw);
        if (decoded is! Map || decoded['data'] is! Map) continue;
        final requestKey = key.substring(_legacyCachePrefix.length);
        await db.insert(
          'api_cache',
          {
            'request_key': requestKey,
            'data_json': jsonEncode(decoded['data']),
            'saved_at': decoded['savedAt']?.toString() ?? DateTime.now().toIso8601String(),
          },
          conflictAlgorithm: ConflictAlgorithm.ignore,
        );
      } catch (_) {}
    }

    await prefs.setBool(_migrationKey, true);
  }
}

class SyncNeedsAttentionException implements Exception {
  const SyncNeedsAttentionException(this.message);
  final String message;
  @override
  String toString() => message;
}
