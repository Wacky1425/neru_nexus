# Flutter Cleanup 7

最終構造監査。

## 削除
- `lib/features/categories/model/category_model.dart` — 0 byte、import/参照なし
- `lib/features/home/widgets/section_title.dart` — 0 byte、import/参照なし
- `cupertino_icons` dependency — `CupertinoIcons` / package importともに参照なし

## 確認
- `savingTarget` / `dreamTarget` / `featuredDream` の旧Flutter参照なし
- Import History は `billingYearMonths` のみ利用
- `http`, `fl_chart`, `file_picker`, `charset`, `shared_preferences` は現役参照あり
- その他Dartファイルに孤立ファイルなし（main.dart除く）
