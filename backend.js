require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const tasks = [
  { id: 'daily-app-check', title: 'Daily App Check', category: 'app', reward: 50, description: 'Open and interact with the assigned application.' },
  { id: 'quick-survey', title: 'Quick Survey', category: 'survey', reward: 75, description: 'Answer a short customer survey.' },
  { id: 'product-research', title: 'Product Research', category: 'research', reward: 100, description: 'Complete a short product research activity.' },
  { id: 'app-engagement', title: 'App Engagement', category: 'app', reward: 50, description: 'Complete an assigned app activity.' },
  { id: 'survey', title: 'Survey', category: 'survey', reward: 75, description: 'Answer questions about a product or service.' },
  { id: 'review-task', title: 'Review Task', category: 'review', reward: 100, description: 'Provide feedback about an assigned service.' }
];

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['member', 'admin'], default: 'member' },
  plan: { type: String, default: 'Basic' },
  createdAt: { type: String, required: true },
  memberType: { type: String, required: true },
  availableBalance: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  referralEarnings: { type: Number, default: 0 },
  tasksCompleted: { type: Number, default: 0 },
  completedToday: {
    date: { type: String, default: '' },
    taskIds: { type: [String], default: [] }
  },
  wallet: {
    totalDeposits: { type: Number, default: 0 },
    totalWithdrawals: { type: Number, default: 0 },
    pendingWithdrawals: { type: Number, default: 0 }
  },
  referrals: { type: Number, default: 0 },
  transactions: { type: [mongoose.Schema.Types.Mixed], default: [] }
}, { versionKey: false });

const taskSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  title: { type: String, required: true },
  type: { type: String, required: true },
  category: { type: String, required: true },
  reward: { type: Number, required: true },
  description: { type: String, required: true },
  video: { type: String, default: '' },
  createdAt: { type: String, required: true }
}, { versionKey: false });

const withdrawalSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  account: { type: String, required: true },
  method: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: String, required: true },
  reviewedAt: { type: String }
}, { versionKey: false });

const sessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { versionKey: false });

const User = mongoose.model('User', userSchema);
const PublishedTask = mongoose.model('PublishedTask', taskSchema);
const WithdrawalRequest = mongoose.model('WithdrawalRequest', withdrawalSchema);
const LoginSession = mongoose.model('LoginSession', sessionSchema);

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function passwordMatches(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === candidate.length && crypto.timingSafeEqual(candidate, expected);
}

function createUser({
  name,
  email,
  password,
  role = 'member',
  plan = 'Basic',
  startingBalance = 0,
  totalEarnings = 0,
  referralEarnings = 0,
  tasksCompleted = 0,
  wallet = { totalDeposits: 0, totalWithdrawals: 0, pendingWithdrawals: 0 },
  transactions = []
}) {
  return {
    id: crypto.randomUUID(),
    name,
    email: email.toLowerCase(),
    passwordHash: hashPassword(password),
    role,
    plan,
    createdAt: new Date().toISOString(),
    memberType: role === 'admin' ? 'Admin' : 'Member',
    availableBalance: startingBalance,
    totalEarnings,
    referralEarnings,
    tasksCompleted,
    completedToday: { date: '', taskIds: [] },
    wallet: { ...wallet },
    referrals: 0,
    transactions
  };
}

function sanitizeUser(user) {
  const safeUser = user.toObject();
  delete safeUser.passwordHash;
  delete safeUser._id;
  return safeUser;
}

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function issueSession(user) {
  const token = crypto.randomUUID();
  await LoginSession.create({
    tokenHash: hashSessionToken(token),
    userId: user.id,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  });
  return token;
}

async function getUserByToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  const session = await LoginSession.findOne({
    tokenHash: hashSessionToken(token),
    expiresAt: { $gt: new Date() }
  });
  if (!session) return null;
  return User.findOne({ id: session.userId });
}

async function requireUser(req, res) {
  const user = await getUserByToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ message: 'Unauthorized. Please log in again.' });
    return null;
  }
  return user;
}

async function requireAdmin(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (user.role !== 'admin') {
    res.status(403).json({ message: 'Admin access required.' });
    return null;
  }
  return user;
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

async function getAllTasks() {
  const publishedTasks = await PublishedTask.find().sort({ createdAt: -1 });
  return [...tasks, ...publishedTasks.map((task) => task.toObject())];
}

async function ensureAdminAccount() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email && !password) {
    console.warn('ADMIN_EMAIL and ADMIN_PASSWORD are not set; no admin account was provisioned.');
    return;
  }
  if (!email || !password) {
    throw new Error('Set both ADMIN_EMAIL and ADMIN_PASSWORD to provision the admin account.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) {
    throw new Error('ADMIN_EMAIL must be valid and ADMIN_PASSWORD must be at least 12 characters.');
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    if (existingUser.role !== 'admin') {
      throw new Error('ADMIN_EMAIL is already registered as a member; choose another admin email.');
    }
    return;
  }

  await User.create(createUser({
    name: process.env.ADMIN_NAME?.trim() || 'Administrator',
    email,
    password,
    role: 'admin'
  }));
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'TaskEarn backend is running', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/register', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }

  const newUser = createUser({ name, email, password });
  let user;
  try {
    user = await User.create(newUser);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }
    throw error;
  }

  return res.status(201).json({
    message: 'Account created successfully.',
    token: await issueSession(user),
    user: sanitizeUser(user)
  });
});

app.post('/api/login', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const user = await User.findOne({ email });
  if (!user || !passwordMatches(password, user.passwordHash)) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  return res.json({
    message: 'Login successful.',
    token: await issueSession(user),
    user: sanitizeUser(user)
  });
});

app.post('/api/logout', async (req, res) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7).trim()
    : '';
  if (token) await LoginSession.deleteOne({ tokenHash: hashSessionToken(token) });
  res.json({ message: 'Logged out successfully.' });
});

app.get('/api/dashboard', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const today = getToday();
  if (user.completedToday.date !== today) {
    user.completedToday = { date: today, taskIds: [] };
    await user.save();
  }
  res.json({
    user: sanitizeUser(user),
    stats: {
      balance: user.availableBalance,
      totalEarnings: user.totalEarnings,
      referralEarnings: user.referralEarnings,
      tasksCompleted: user.tasksCompleted
    },
    tasks: (await getAllTasks()).map((task) => ({
      ...task,
      available: !user.completedToday.taskIds.includes(task.id)
    }))
  });
});

app.get('/api/tasks', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const today = getToday();
  if (user.completedToday.date !== today) {
    user.completedToday = { date: today, taskIds: [] };
    await user.save();
  }
  res.json({
    tasks: (await getAllTasks()).map((task) => ({
      ...task,
      available: !user.completedToday.taskIds.includes(task.id)
    }))
  });
});

app.post('/api/tasks/:taskId/complete', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const task = (await getAllTasks()).find((item) => item.id === req.params.taskId);
  if (!task) return res.status(404).json({ message: 'Task not found.' });

  const today = getToday();
  if (user.completedToday.date !== today) user.completedToday = { date: today, taskIds: [] };
  if (user.completedToday.taskIds.includes(task.id)) {
    return res.status(409).json({ message: 'You have already completed this task today.' });
  }

  user.completedToday.taskIds.push(task.id);
  user.availableBalance += task.reward;
  user.totalEarnings += task.reward;
  user.tasksCompleted += 1;
  user.transactions.unshift({
    id: crypto.randomUUID(),
    date: today,
    description: task.title,
    amount: task.reward,
    status: 'completed'
  });
  await user.save();

  return res.json({
    message: `${task.title} completed successfully.`,
    reward: task.reward,
    balance: user.availableBalance,
    tasksCompleted: user.tasksCompleted,
    transactions: user.transactions
  });
});

app.get('/api/wallet', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  res.json({
    availableBalance: user.availableBalance,
    totalDeposits: user.wallet.totalDeposits,
    totalWithdrawals: user.wallet.totalWithdrawals,
    pendingWithdrawals: user.wallet.pendingWithdrawals,
    transactions: user.transactions
  });
});

app.post('/api/withdraw', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const amount = Number(req.body?.amount);
  const account = typeof req.body?.account === 'string' ? req.body.account.trim() : '';
  const method = typeof req.body?.method === 'string' ? req.body.method : '';
  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ message: 'A valid withdrawal amount is required.' });
  }
  if (!account || account.length > 100) {
    return res.status(400).json({ message: 'Enter a valid withdrawal account or phone number.' });
  }
  if (!['M-Pesa', 'Bank Transfer'].includes(method)) {
    return res.status(400).json({ message: 'Choose a valid withdrawal method.' });
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Nairobi',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());
  const localTime = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localMinutes = Number(localTime.hour) * 60 + Number(localTime.minute);
  if (localTime.weekday !== 'Fri' || localMinutes < 420 || localMinutes > 840) {
    return res.status(400).json({ message: 'Withdrawals are available only on Friday from 7:00 AM to 2:00 PM East Africa Time.' });
  }
  if (amount > user.availableBalance) {
    return res.status(400).json({ message: 'Withdrawal amount cannot exceed available balance.' });
  }

  user.availableBalance -= amount;
  user.wallet.pendingWithdrawals += amount;
  const withdrawal = {
    id: crypto.randomUUID(),
    userId: user.id,
    amount,
    account,
    method,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  user.transactions.unshift({
    id: `withdraw-${withdrawal.id}`,
    date: getToday(),
    description: 'Withdrawal',
    amount: -amount,
    status: 'pending'
  });
  await Promise.all([
    user.save(),
    WithdrawalRequest.create(withdrawal)
  ]);

  return res.json({
    message: 'Withdrawal request submitted.',
    availableBalance: user.availableBalance,
    pendingWithdrawals: user.wallet.pendingWithdrawals,
    transactions: user.transactions
  });
});

app.get('/api/admin/summary', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const [users, pendingWithdrawalRequests, publishedTasks] = await Promise.all([
    User.find(),
    WithdrawalRequest.countDocuments({ status: 'pending' }),
    PublishedTask.countDocuments()
  ]);
  res.json({
    totalUsers: users.length,
    totalBalance: users.reduce((sum, user) => sum + user.availableBalance, 0),
    totalEarnings: users.reduce((sum, user) => sum + user.totalEarnings, 0),
    pendingWithdrawals: users.reduce((sum, user) => sum + user.wallet.pendingWithdrawals, 0),
    pendingWithdrawalRequests,
    tasksCompleted: users.reduce((sum, user) => sum + user.tasksCompleted, 0),
    publishedTasks,
    activeTasks: tasks.length + publishedTasks
  });
});

app.get('/api/admin/tasks', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const publishedTasks = await PublishedTask.find().sort({ createdAt: -1 }).lean();
  res.json({ tasks: publishedTasks });
});

app.get('/api/admin/users', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const users = await User.find();
  res.json({ users: users.map(sanitizeUser) });
});

app.get('/api/admin/withdrawals', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const withdrawals = await WithdrawalRequest.find().sort({ createdAt: -1 }).lean();
  const users = await User.find({ id: { $in: withdrawals.map((request) => request.userId) } });
  const usersById = new Map(users.map((user) => [user.id, user]));
  res.json({
    withdrawals: withdrawals.map((request) => {
      const user = usersById.get(request.userId);
      return {
        ...request,
        account: request.account.replace(/.(?=.{2})/g, '*'),
        memberName: user ? user.name : 'Unknown member',
        memberEmail: user ? user.email : ''
      };
    })
  });
});

app.post('/api/admin/withdrawals/:id/review', async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const status = req.body?.status;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Choose approve or reject for this withdrawal.' });
  }

  const request = await WithdrawalRequest.findOne({ id: req.params.id });
  if (!request) return res.status(404).json({ message: 'Withdrawal request not found.' });
  if (request.status !== 'pending') {
    return res.status(409).json({ message: 'This withdrawal request has already been reviewed.' });
  }
  const user = await User.findOne({ id: request.userId });
  if (!user) return res.status(404).json({ message: 'The member account for this request no longer exists.' });

  request.status = status;
  request.reviewedAt = new Date().toISOString();
  user.wallet.pendingWithdrawals -= request.amount;
  if (status === 'approved') {
    user.wallet.totalWithdrawals += request.amount;
  } else {
    user.availableBalance += request.amount;
  }
  const transaction = user.transactions.find((item) => item.id === `withdraw-${request.id}`);
  if (transaction) transaction.status = status === 'approved' ? 'approved' : 'failed';
  await Promise.all([request.save(), user.save()]);

  res.json({
    message: status === 'approved'
      ? 'Withdrawal approved for manual payout. No payment provider is connected.'
      : 'Withdrawal rejected and the amount was returned to the member balance.',
    withdrawal: request,
    balance: user.availableBalance
  });
});

app.post('/api/admin/users', async (req, res) => {
  if (!await requireAdmin(req, res)) return;

  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const plan = typeof req.body?.plan === 'string' ? req.body.plan : 'Basic';
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and an initial password are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'The initial password must be at least 6 characters.' });
  }
  if (!['Basic', 'Premium', 'VIP'].includes(plan)) {
    return res.status(400).json({ message: 'Choose a valid membership plan.' });
  }

  try {
    const user = await User.create(createUser({ name, email, password, plan }));
    res.status(201).json({ message: 'Member created successfully.', user: sanitizeUser(user) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }
    throw error;
  }
});

app.post('/api/admin/tasks', async (req, res) => {
  if (!await requireAdmin(req, res)) return;

  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const type = typeof req.body?.type === 'string' ? req.body.type : 'standard';
  const reward = Number(req.body?.reward);
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  const video = typeof req.body?.video === 'string' ? req.body.video.trim() : '';

  if (!name || !description || !Number.isInteger(reward) || reward < 1 || reward > 5000) {
    return res.status(400).json({ message: 'Provide a task name, description, and whole-number reward from 1 to 5,000.' });
  }
  if (!['standard', 'question', 'video'].includes(type)) {
    return res.status(400).json({ message: 'Choose a valid task type.' });
  }
  if (type === 'video' && (!video || !/^https?:\/\//i.test(video))) {
    return res.status(400).json({ message: 'Video tasks require a valid HTTP or HTTPS URL.' });
  }

  const task = {
    id: crypto.randomUUID(),
    name,
    title: name,
    type,
    category: type,
    reward,
    description,
    video,
    createdAt: new Date().toISOString()
  };
  await PublishedTask.create(task);
  res.status(201).json({ message: 'Task published successfully.', task });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/senior', (req, res) => {
  res.sendFile(path.join(__dirname, 'senior.html'));
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  const status = Number.isInteger(error.status) && error.status >= 400 ? error.status : 500;
  res.status(status).json({
    message: status < 500 ? 'The request could not be processed.' : 'An unexpected server error occurred.'
  });
});

async function startServer() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is required. Add your MongoDB Atlas connection string to the deployment environment.');
  }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await ensureAdminAccount();
  return app.listen(PORT, () => {
    console.log(`TaskEarn backend is running on port ${PORT}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Backend startup failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = app;
