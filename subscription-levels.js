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

const withdrawalSchedules = Object.freeze({
  Basic: Object.freeze([
    Object.freeze({ days: Object.freeze(['Fri']), start: '06:00', end: '14:00' })
  ]),
  VIP: Object.freeze([
    Object.freeze({ days: Object.freeze(['Tue', 'Sun']), start: '14:00', end: '19:00' })
  ]),
  Premium: Object.freeze([
    Object.freeze({ days: Object.freeze(['Tue', 'Sun']), start: '14:00', end: '19:00' }),
    Object.freeze({ days: Object.freeze(['Fri']), start: '06:00', end: '14:00' })
  ])
});

function getSubscriptionLevel(level) {
  if (!Number.isInteger(level) || level < 1 || level > levels.length) return null;
  return levels[level - 1];
}

function getWithdrawalSchedule(plan) {
  return withdrawalSchedules[plan] || null;
}

function isWithdrawalWindowOpen(plan, dateValue = new Date()) {
  const schedule = getWithdrawalSchedule(plan);
  if (!schedule) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('A valid date is required to check the withdrawal schedule.');
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Nairobi',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const localTime = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const minutes = Number(localTime.hour) * 60 + Number(localTime.minute);
  return schedule.some((slot) => {
    const start = Number(slot.start.slice(0, 2)) * 60 + Number(slot.start.slice(3));
    const end = Number(slot.end.slice(0, 2)) * 60 + Number(slot.end.slice(3));
    return slot.days.includes(localTime.weekday) && minutes >= start && minutes < end;
  });
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

function calculateReferralGroupBonus(subscriptionAmounts) {
  if (!Array.isArray(subscriptionAmounts) || subscriptionAmounts.length < 12) {
    throw new TypeError('Twelve recorded subscription amounts are required for the first referral group bonus.');
  }
  const firstGroupAmounts = subscriptionAmounts.slice(0, 12);
  if (firstGroupAmounts.some((amount) => !Number.isSafeInteger(amount) || amount <= 0)) {
    throw new TypeError('Each first-group subscription amount must be a positive whole number.');
  }
  const basisAmount = firstGroupAmounts.reduce((total, amount) => total + amount, 0);
  if (!Number.isSafeInteger(basisAmount)) {
    throw new TypeError('The total first-group subscription amount exceeds the supported range.');
  }
  return {
    memberCount: firstGroupAmounts.length,
    basisAmount,
    rate: 0.15,
    amount: Math.round(basisAmount * 0.15)
  };
}

module.exports = {
  levels,
  getSubscriptionLevel,
  getWithdrawalSchedule,
  isWithdrawalWindowOpen,
  calculateReferralCommission,
  calculateReferralGroupBonus
};
