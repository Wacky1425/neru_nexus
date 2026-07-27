function rebuildHomeDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("home");

  if (!sheet) {
    throw new Error("home シートがありません");
  }

  const yearMonth = getLatestBudgetMonth();
  if (!yearMonth) {
    throw new Error("budgets に対象月がありません");
  }

  const availableMoney = getAvailableMoney(yearMonth);
  const savingForecast = getSavingForecast(yearMonth);
  const sideProfit = getSideBusinessProfit(yearMonth);
  const health = getMoneyHealth(yearMonth);
  const featuredDream = getFeaturedDreamFund();

  sheet.clear();

  // 全体設定
  sheet.setHiddenGridlines(true);

  for (let col = 1; col <= 6; col++) {
    sheet.setColumnWidth(col, 110);
  }

  sheet.setRowHeight(1, 38);
  sheet.setRowHeight(2, 22);
  sheet.setRowHeight(4, 28);
  sheet.setRowHeight(6, 32);
  sheet.setRowHeight(7, 48);
  sheet.setRowHeight(8, 20);
  sheet.setRowHeight(10, 32);
  sheet.setRowHeight(11, 48);
  sheet.setRowHeight(12, 20);
  sheet.setRowHeight(14,32);
  sheet.setRowHeight(15,80);
  sheet.setRowHeight(16,25);
  sheet.setRowHeight(17,25);
  sheet.setRowHeight(19, 32);
  sheet.setRowHeight(20, 30);
  sheet.setRowHeight(21, 48);
  sheet.setRowHeight(22, 28);
  sheet.setRowHeight(23, 28);

  // タイトル
  sheet.getRange("A1:F1")
    .merge()
    .setValue("Neru Nexus")
    .setFontSize(24)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet.getRange("A2:F2")
    .merge()
    .setValue("Your Personal Finance OS")
    .setFontSize(10)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet.getRange("A1:F1")
    .setBackground("#263238")
    .setFontColor("#FFFFFF");

  sheet.getRange("A2:F2")
    .setBackground("#263238")
    .setFontColor("#CFD8DC");

  sheet.getRange("A4:D4")
    .setBackground("#ECEFF1");

  // 対象月
  sheet.getRange("A4:B4")
    .merge()
    .setValue("対象月")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sheet.getRange("C4:D4")
    .merge()
    .setValue(yearMonth)
    .setHorizontalAlignment("center");

  // カード1：あと使えるお金
  sheet.getRange("A6:B6")
    .merge()
    .setValue("あと使えるお金")
    .setFontSize(13)
    .setFontWeight("bold");

  sheet.getRange("A7:B8")
    .merge()
    .setValue(availableMoney)
    .setNumberFormat('¥#,##0;[Red]-¥#,##0')
    .setFontSize(26)
    .setFontWeight("bold");

  // カード2：今月貯金予測
  sheet.getRange("C6:D6")
    .merge()
    .setValue("今月貯金予測")
    .setFontSize(13)
    .setFontWeight("bold");

  sheet.getRange("C7:D8")
    .merge()
    .setValue(savingForecast)
    .setNumberFormat('¥#,##0;[Red]-¥#,##0')
    .setFontSize(26)
    .setFontWeight("bold");

  // カード3：副業利益
  sheet.getRange("E6:F6")
    .merge()
    .setValue("副業利益")
    .setFontSize(13)
    .setFontWeight("bold");

  sheet.getRange("E7:F8")
    .merge()
    .setValue(sideProfit)
    .setNumberFormat('¥#,##0;[Red]-¥#,##0')
    .setFontSize(26)
    .setFontWeight("bold");

  // 補足表示
  sheet.getRange("A10:B10")
    .merge()
    .setValue("生活")
    .setFontWeight("bold");

  sheet.getRange("A11:B12")
    .merge()
    .setValue(
      availableMoney >= 0
        ? "今月の自由枠は残っています"
        : "今月の自由枠を超えています"
    )
    .setWrap(true);

  sheet.getRange("C10:D10")
    .merge()
    .setValue("貯金")
    .setFontWeight("bold");

  sheet.getRange("C11:D12")
    .merge()
    .setValue(
      savingForecast >= 0
        ? "今月は貯金できる見込みです"
        : "今月は赤字見込みです"
    )
    .setWrap(true);

  sheet.getRange("E10:F10")
    .merge()
    .setValue("事業")
    .setFontWeight("bold");

  sheet.getRange("E11:F12")
    .merge()
    .setValue(
      sideProfit >= 0
        ? "副業は黒字です"
        : "副業は赤字です"
    )
    .setWrap(true);

  sheet.getRange("A14:F14")
    .merge()
    .setValue("Money Health")
    .setFontWeight("bold")
    .setFontSize(14);

  sheet.getRange("A15:F17")
    .merge()
    .setValue(
      [
        `${health.level} ${health.title}`,
        "",
        health.message
      ].join("\n")
    )
    .setHorizontalAlignment("left")
    .setVerticalAlignment("top")
    .setFontSize(11)
    .setWrap(true);

  // Dream Fund
  sheet.getRange("A19:F19")
    .merge()
    .setValue("Dream Fund")
    .setFontSize(14)
    .setFontWeight("bold");

  if (featuredDream) {
    const progressPercent = Math.round(featuredDream.progress * 100);

    sheet.getRange("A20:F20")
      .merge()
      .setValue(featuredDream.name)
      .setFontSize(13)
      .setFontWeight("bold");

    sheet.getRange("A21:F21")
      .merge()
      .setValue(progressPercent / 100)
      .setNumberFormat("0%")
      .setFontSize(26)
      .setFontWeight("bold");

    sheet.getRange("A22:C22")
      .merge()
      .setValue("現在額");

    sheet.getRange("D22:F22")
      .merge()
      .setValue(featuredDream.current_amount)
      .setNumberFormat('¥#,##0');

    sheet.getRange("A23:C23")
      .merge()
      .setValue("目標まであと");

    sheet.getRange("D23:F23")
      .merge()
      .setValue(featuredDream.remain_amount)
      .setNumberFormat('¥#,##0');

    sheet.getRange("A19:F23")
      .setBackground("#FFF8E1");

    sheet.getRange("A21:F21")
      .setFontColor("#F57F17");
  } else {
    sheet.getRange("A20:F23")
      .merge()
      .setValue("進行中のDream Fundはありません")
      .setWrap(true)
      .setBackground("#F7F7F7");
  }
  
  // カード背景の初期色
  sheet.getRange("A6:B8").setBackground("#E8F5E9");
  sheet.getRange("C6:D8").setBackground("#E3F2FD");
  sheet.getRange("E6:F8").setBackground("#F3E5F5");

  sheet.getRange("A10:B12").setBackground("#F7F7F7");
  sheet.getRange("C10:D12").setBackground("#F7F7F7");
  sheet.getRange("E10:F12").setBackground("#F7F7F7");

  sheet.getRange("A14:F17").setBackground("#F7F7F7");

  // あと使えるお金
  if (availableMoney < 0) {
    sheet.getRange("A6:B8").setBackground("#FFEBEE");
    sheet.getRange("A7:B8").setFontColor("#C62828");
  } else if (availableMoney < 10000) {
    sheet.getRange("A6:B8").setBackground("#FFF8E1");
    sheet.getRange("A7:B8").setFontColor("#F57F17");
  } else {
    sheet.getRange("A7:B8").setFontColor("#2E7D32");
  }

  // 貯金予測
  if (savingForecast < 0) {
    sheet.getRange("C6:D8").setBackground("#FFEBEE");
    sheet.getRange("C7:D8").setFontColor("#C62828");
  } else {
    sheet.getRange("C7:D8").setFontColor("#1565C0");
  }

  // 副業利益
  if (sideProfit < 0) {
    sheet.getRange("E6:F8").setBackground("#FFEBEE");
    sheet.getRange("E7:F8").setFontColor("#C62828");
  } else {
    sheet.getRange("E7:F8").setFontColor("#6A1B9A");
  }

  // Money Health
  if (health.level === "🔴") {
    sheet.getRange("A14:F17").setBackground("#FFEBEE");
    sheet.getRange("A15:F17").setFontColor("#C62828");
  } else if (health.level === "🟡") {
    sheet.getRange("A14:F17").setBackground("#FFF8E1");
    sheet.getRange("A15:F17").setFontColor("#F57F17");
  } else {
    sheet.getRange("A14:F17").setBackground("#E8F5E9");
    sheet.getRange("A15:F17").setFontColor("#2E7D32");
  }

  // 共通レイアウト
  sheet.getRange("A1:F23")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  const cardRanges = [
    "A6:B8",
    "C6:D8",
    "E6:F8",
    "A10:B12",
    "C10:D12",
    "E10:F12",
    "A14:F17",
    "A19:F23"
  ];

  for (const rangeName of cardRanges) {
    sheet.getRange(rangeName)
      .setBorder(
        true,
        true,
        true,
        true,
        false,
        false,
        "#B0BEC5",
        SpreadsheetApp.BorderStyle.SOLID
      );
  }

  Logger.log(
    [
      `${yearMonth}`,
      `あと使えるお金: ${availableMoney}`,
      `今月貯金予測: ${savingForecast}`,
      `副業利益: ${sideProfit}`
    ].join(" / ")
  );
}

function getAvailableMoney(yearMonth) {
  const budgets = getBudgetsForMonth(yearMonth);
  const expenses =
    getMonthlyLivingExpenseBreakdown(yearMonth);

  return (
    Number(budgets["給与予定"] || 0)
    - Number(budgets["固定費予算"] || 0)
    - Number(budgets["NISA積立"] || 0)
    - Number(budgets["貯金目標"] || 0)
    - expenses.variableExpense
  );
}

function getSavingForecast(yearMonth) {
  const budgets = getBudgetsForMonth(yearMonth);

  const salary =
    Number(budgets["給与予定"] || 0);

  const fixedCostBudget =
    Number(budgets["固定費予算"] || 0);

  const variableBudget =
    Number(budgets["変動費予算"] || 0);

  const investmentTarget =
    Number(budgets["NISA積立"] || 0);

  const expenses =
    getMonthlyLivingExpenseBreakdown(yearMonth);

  const targetMonth =
    normalizeBudgetYearMonth(yearMonth);

  const now = new Date();

  const currentMonth = Utilities.formatDate(
    now,
    "Asia/Tokyo",
    "yyyy-MM"
  );

  let projectedVariableExpense = variableBudget;

  if (targetMonth === currentMonth) {
    const elapsedDays = Number(
      Utilities.formatDate(
        now,
        "Asia/Tokyo",
        "d"
      )
    );

    const [year, month] = targetMonth
      .split("-")
      .map(Number);

    const daysInMonth =
      new Date(year, month, 0).getDate();

    if (
      elapsedDays > 0 &&
      expenses.variableExpense > 0
    ) {
      projectedVariableExpense = Math.round(
        expenses.variableExpense /
        elapsedDays *
        daysInMonth
      );
    }
  } else if (targetMonth < currentMonth) {
    projectedVariableExpense =
      expenses.variableExpense;
  }

  return (
    salary
    - fixedCostBudget
    - projectedVariableExpense
    - investmentTarget
  );
}

function testHomeMetrics() {
  const yearMonth = getLatestBudgetMonth();

  Logger.log(`対象月: ${yearMonth}`);
  Logger.log(`あと使えるお金: ${getAvailableMoney(yearMonth)}`);
  Logger.log(`今月貯金予測: ${getSavingForecast(yearMonth)}`);
}

function testHomeDashboard(){

  rebuildHomeDashboard();

  Logger.log("Home更新完了");

}