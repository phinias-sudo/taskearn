const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateDailyQuestions,
  getNairobiDate,
  getNairobiWeekday,
  isCorrectAnswer
} = require('../daily-questions');

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

test('all subscription levels generate five distinct questions per weekday', () => {
  const allQuestions = [];

  for (let level = 1; level <= 30; level += 1) {
    for (const weekday of weekdays) {
      const questions = generateDailyQuestions(level, weekday);
      assert.equal(questions.length, 5);
      assert.ok(questions.every((question) => question.q && question.answer !== undefined));
      allQuestions.push(...questions.map((question) => question.q));
    }
  }

  assert.equal(allQuestions.length, 750);
  assert.equal(new Set(allQuestions).size, 750);
});

test('question generation rejects invalid levels and unsupported weekdays', () => {
  assert.throws(() => generateDailyQuestions(0, 'Monday'), RangeError);
  assert.throws(() => generateDailyQuestions(31, 'Monday'), RangeError);
  assert.throws(() => generateDailyQuestions(1, 'Saturday'), RangeError);
});

test('answers are checked case-insensitively without accepting non-string submissions', () => {
  assert.equal(isCorrectAnswer('Nairobi', '  nairobi  '), true);
  assert.equal(isCorrectAnswer(42, '42'), true);
  assert.equal(isCorrectAnswer(42, 42), false);
  assert.equal(isCorrectAnswer('Nairobi', 'Mombasa'), false);
});

test('daily date and weekday use Nairobi time across UTC date boundaries', () => {
  const instant = '2024-06-02T21:30:00Z';
  assert.equal(getNairobiDate(instant), '2024-06-03');
  assert.equal(getNairobiWeekday(instant), 'Monday');
  assert.throws(() => getNairobiDate('not a date'), TypeError);
});
