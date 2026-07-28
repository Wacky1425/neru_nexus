

function getHomeData() {
  const yearMonth = getLatestBudgetMonth();

  if (!yearMonth) {
    throw new Error("対象月がありません");
  }

  return {
    yearMonth,
    availableMoney: getAvailableMoney(yearMonth),
    savingForecast: getSavingForecast(yearMonth),
    sideBusinessProfit: getSideBusinessProfit(yearMonth),
    moneyHealth: getMoneyHealth(yearMonth),
    featuredDream: getFeaturedDreamFund(),
    generatedAt: new Date().toISOString()
  };
}