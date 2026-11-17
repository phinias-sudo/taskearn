const levels = Object.freeze([
  ['Basic', 1000],
  ['Basic', 1500],
  ['Basic', 2000],
  ['Basic', 2500],
  ['Basic', 3000],
  ['Basic', 4000],
  ['VIP', 5000],
  ['VIP', 6000],
  ['VIP', 7500],
  ['VIP', 9000],
  ['VIP', 10500],
  ['VIP', 12000],
  ['VIP', 14000],
  ['VIP', 16000],
  ['VIP', 18000],
  ['Premium', 20000],
  ['Premium', 22500],
  ['Premium', 25000],
  ['Premium', 27500],
  ['Premium', 30000],
  ['Premium', 33000],
  ['Premium', 36000],
  ['Premium', 40000],
  ['Premium', 44000],
  ['Premium', 48000],
  ['Premium', 52000],
  ['Premium', 56000],
  ['Premium', 60000],
  ['Premium', 65000],
  ['Premium', 70000]
].map(([plan, amount], index) => Object.freeze({
  level: index + 1,
  plan,
  amount
})));

function getSubscriptionLevel(level) {
  if (!Number.isInteger(level) || level < 1 || level > levels.length) return null;
  return levels[level - 1];
}

function isWeekend(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('A valid date is required to calculate referral commission.');
  }
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Nairobi',
    weekday: 'short'
  }).format(date);
  return weekday === 'Sat' || weekday === 'Sun';
}

function calculateReferralCommission(subscriptionAmount, registeredAt, approvedAt) {
  if (!Number.isSafeInteger(subscriptionAmount) || subscriptionAmount <= 0) {
    throw new TypeError('A positive whole-number subscription amount is required.');
  }
  const rate = isWeekend(registeredAt) && isWeekend(approvedAt) ? 0.2 : 0.1;
  return {
    rate,
    amount: Math.round(subscriptionAmount * rate)
  };
}

module.exports = {
  levels,
  getSubscriptionLevel,
  calculateReferralCommission
};
