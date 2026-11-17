const test = require('node:test');
const assert = require('node:assert/strict');
const {
  levels,
  getSubscriptionLevel,
  getWithdrawalSchedule,
  isWithdrawalWindowOpen,
  calculateReferralCommission
} = require('../subscription-levels');

test('subscription levels use the configured tier and fee schedule', () => {
  const expectedAmounts = [
    1000, 1500, 2000, 2500, 3000, 4000,
    5000, 6000, 7500, 9000, 10500, 12000, 14000, 16000, 18000,
    20000, 22500, 25000, 27500, 30000, 33000, 36000, 40000, 44000,
    48000, 52000, 56000, 60000, 65000, 70000
  ];
  const expectedPlans = [
    ...Array(6).fill('Basic'),
    ...Array(9).fill('VIP'),
    ...Array(15).fill('Premium')
  ];
  assert.equal(levels.length, 30);
  assert.deepEqual(levels.map((level) => level.amount), expectedAmounts);
  assert.deepEqual(levels.map((level) => level.plan), expectedPlans);
  assert.deepEqual(getSubscriptionLevel(1), { level: 1, plan: 'Basic', amount: 1000 });
  assert.deepEqual(getSubscriptionLevel(7), { level: 7, plan: 'VIP', amount: 5000 });
  assert.deepEqual(getSubscriptionLevel(16), { level: 16, plan: 'Premium', amount: 20000 });
  assert.deepEqual(getSubscriptionLevel(30), { level: 30, plan: 'Premium', amount: 70000 });
  assert.equal(getSubscriptionLevel(0), null);
  assert.equal(getSubscriptionLevel(31), null);
  assert.equal(getSubscriptionLevel('1'), null);
});

test('withdrawal schedules follow the plan days and East Africa Time windows', () => {
  assert.deepEqual(getWithdrawalSchedule('Basic'), [
    { days: ['Fri'], start: '06:00', end: '14:00' }
  ]);
  assert.deepEqual(getWithdrawalSchedule('VIP'), [
    { days: ['Tue', 'Sun'], start: '14:00', end: '19:00' }
  ]);
  assert.deepEqual(getWithdrawalSchedule('Premium'), [
    { days: ['Tue', 'Sun'], start: '14:00', end: '19:00' },
    { days: ['Fri'], start: '06:00', end: '14:00' }
  ]);
  assert.equal(getWithdrawalSchedule('Unknown'), null);

  assert.equal(isWithdrawalWindowOpen('Basic', '2024-06-07T02:59:00Z'), false);
  assert.equal(isWithdrawalWindowOpen('Basic', '2024-06-07T03:00:00Z'), true);
  assert.equal(isWithdrawalWindowOpen('Basic', '2024-06-07T10:59:00Z'), true);
  assert.equal(isWithdrawalWindowOpen('Basic', '2024-06-07T11:00:00Z'), false);
  assert.equal(isWithdrawalWindowOpen('Basic', '2024-06-04T11:00:00Z'), false);
  assert.equal(isWithdrawalWindowOpen('VIP', '2024-06-04T11:00:00Z'), true);
  assert.equal(isWithdrawalWindowOpen('VIP', '2024-06-04T16:00:00Z'), false);
  assert.equal(isWithdrawalWindowOpen('VIP', '2024-06-07T03:00:00Z'), false);
  assert.equal(isWithdrawalWindowOpen('Premium', '2024-06-09T11:00:00Z'), true);
  assert.equal(isWithdrawalWindowOpen('Premium', '2024-06-07T03:00:00Z'), true);
});

test('weekend commission is 20% only when signup and approval are both on weekends in Nairobi time', () => {
  const weekendRegistration = '2024-06-01T09:00:00+03:00';
  const weekendApproval = '2024-06-02T09:00:00+03:00';
  const weekdayRegistration = '2024-06-03T09:00:00+03:00';
  const weekdayApproval = '2024-06-03T12:00:00+03:00';

  assert.deepEqual(
    calculateReferralCommission(9000, weekendRegistration, weekendApproval),
    { rate: 0.2, amount: 1800 }
  );
  assert.deepEqual(
    calculateReferralCommission(9000, weekendRegistration, weekdayApproval),
    { rate: 0.1, amount: 900 }
  );
  assert.deepEqual(
    calculateReferralCommission(9000, weekdayRegistration, weekendApproval),
    { rate: 0.1, amount: 900 }
  );
  assert.deepEqual(
    calculateReferralCommission(5000, '2024-05-31T21:30:00Z', '2024-06-01T22:30:00Z'),
    { rate: 0.2, amount: 1000 }
  );
});
