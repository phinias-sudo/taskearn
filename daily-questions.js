const { getSubscriptionLevel } = require('./subscription-levels');

const ENGLISH = [
  { word: 'Hot', opp: 'Cold' }, { word: 'Rich', opp: 'Poor' }, { word: 'Big', opp: 'Small' },
  { word: 'Happy', opp: 'Sad' }, { word: 'Fast', opp: 'Slow' }, { word: 'Strong', opp: 'Weak' },
  { word: 'Early', opp: 'Late' }, { word: 'Full', opp: 'Empty' }, { word: 'Brave', opp: 'Coward' },
  { word: 'Expand', opp: 'Contract' }, { word: 'Success', opp: 'Failure' }, { word: 'Honest', opp: 'Dishonest' },
  { word: 'Ancient', opp: 'Modern' }, { word: 'Victory', opp: 'Defeat' }, { word: 'Generous', opp: 'Selfish' }
];

const GK = [
  { q: 'Capital of Kenya?', a: 'Nairobi' }, { q: 'Capital of Uganda?', a: 'Kampala' },
  { q: 'Capital of Tanzania?', a: 'Dodoma' }, { q: 'Capital of Ethiopia?', a: 'Addis Ababa' },
  { q: 'Currency of Kenya?', a: 'Shilling' }, { q: 'Currency of Japan?', a: 'Yen' },
  { q: 'Largest continent?', a: 'Asia' }, { q: 'How many legs does a cow have?', a: '4' }
];

const DAY_NUMBERS = Object.freeze({
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5
});

function generateDailyQuestions(level, dayName) {
  const subscription = getSubscriptionLevel(level);
  if (!subscription) throw new RangeError('A subscription level from 1 to 30 is required.');
  const dayNumber = DAY_NUMBERS[dayName];
  if (!dayNumber) throw new RangeError('Daily questions are only available Monday through Friday.');

  const reward = subscription.amount / 100;
  const english = ENGLISH[(level + dayNumber) % ENGLISH.length];
  const generalKnowledge = GK[(level + dayNumber) % GK.length];
  let questions;

  if (dayName === 'Monday') {
    const a = level * 5 * dayNumber + 3;
    const b = level * 2 * dayNumber + 1;
    const subscriptionAmount = subscription.amount;
    const percentage = 10;
    questions = [
      { q: `What is ${a} + ${b}?`, answer: a + b },
      { q: `What is ${a} - ${b}?`, answer: a - b },
      { q: `What is ${level + 2} x ${dayNumber + 3}?`, answer: (level + 2) * (dayNumber + 3) },
      { q: `What is ${percentage}% of ${subscriptionAmount}?`, answer: subscriptionAmount * percentage / 100 },
      { q: `If 1 question pays ${reward}, how much for 5 on Monday?`, answer: reward * 5 }
    ];
  } else if (dayName === 'Tuesday') {
    questions = [
      { q: `Opposite of ${english.word} is? (Level ${level})`, answer: english.opp },
      { q: `Plural of Child for Level ${level}?`, answer: 'Children' },
      { q: `Choose correct: She ___ to market. (go/goes) Level ${level}`, answer: 'goes' },
      { q: `Synonym for Happy for Level ${level}?`, answer: 'Joyful' },
      { q: `Complete: They ___ finished work. Level ${level} (have/has)`, answer: 'have' }
    ];
  } else if (dayName === 'Wednesday') {
    const cost = level * 100 * dayNumber + level * 10;
    const sell = cost + level * 50 * dayNumber;
    questions = [
      { q: `You buy for ${cost} and sell for ${sell} on Wednesday. Profit?`, answer: sell - cost },
      { q: `What is 20% of ${subscription.amount} for referral?`, answer: subscription.amount * 0.2 },
      { q: `Shop sells ${level * 2} items at ${level * 10} each. Total sales?`, answer: level * 2 * level * 10 },
      { q: `What is profit if cost ${cost} and sales ${sell}?`, answer: sell - cost },
      { q: `Best way to keep customers for Level ${level}? A) Good service B) Ignore`, answer: 'Good service' }
    ];
  } else if (dayName === 'Thursday') {
    const sequenceStart = level + dayNumber;
    questions = [
      { q: `Next: ${sequenceStart}, ${sequenceStart * 2}, ${sequenceStart * 4}, ?`, answer: sequenceStart * 8 },
      { q: `Next: ${level}, ${level + 5}, ${level + 10}, ?`, answer: level + 15 },
      { q: `If ${level} workers finish in 10 days, how long for ${level * 2} workers?`, answer: 5 },
      { q: `Odd one out for Level ${level}: Apple, Mango, Banana, Carrot`, answer: 'Carrot' },
      { q: `If today is Thursday, what day after 7 days for Level ${level}?`, answer: 'Thursday' }
    ];
  } else {
    const a = level * 5 * 5 + 15;
    const b = level * 2 * 5 + 5;
    questions = [
      { q: `[Maths] What is ${a} + ${b}?`, answer: a + b },
      { q: `[English] Opposite of ${english.word} for Level ${level}?`, answer: english.opp },
      { q: `[Business] What is 5% of ${subscription.amount}?`, answer: subscription.amount * 0.05 },
      { q: `[Logic] Next: ${level + 5}, ${(level + 5) * 2}, ${(level + 5) * 4}, ?`, answer: (level + 5) * 8 },
      { q: `[GK] ${generalKnowledge.q} (Level ${level})`, answer: generalKnowledge.a }
    ];
  }

  return questions;
}

function getNairobiDate(dateValue = new Date()) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) throw new TypeError('A valid date is required.');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getNairobiWeekday(dateValue = new Date()) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) throw new TypeError('A valid date is required.');
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Nairobi',
    weekday: 'long'
  }).format(date);
}

function isCorrectAnswer(expected, actual) {
  if ((typeof expected !== 'string' && typeof expected !== 'number') || typeof actual !== 'string') {
    return false;
  }
  return String(expected).trim().toLocaleLowerCase('en-US')
    === actual.trim().toLocaleLowerCase('en-US');
}

module.exports = {
  generateDailyQuestions,
  getNairobiDate,
  getNairobiWeekday,
  isCorrectAnswer
};
