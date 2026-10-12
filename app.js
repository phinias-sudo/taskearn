(() => {
  const tokenKey = 'taskearnApiToken';
  const localHosts = new Set(['localhost', '127.0.0.1']);
  ['taskearnAccounts', 'taskearnTasks', 'taskearnLoginFailures', 'taskearnLoginClaims', 'taskearnAdminAccountRequest']
    .forEach((key) => localStorage.removeItem(key));
  const apiBaseUrl = location.protocol === 'file:'
    || (localHosts.has(location.hostname) && location.port !== '5000')
    ? 'http://localhost:5000'
    : '';
  let apiTasks = [];
  let currentUser = null;
  let busy = false;
  let selectedPaymentProof = '';

  async function apiRequest(url, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (options.body) headers.set('Content-Type', 'application/json');

    const token = localStorage.getItem(tokenKey);
    if (token) headers.set('Authorization', `Bearer ${token}`);

    let response;
    try {
      response = await fetch(`${apiBaseUrl}${url}`, { ...options, headers });
    } catch (error) {
      throw new Error('Cannot reach the TaskEarn server at http://localhost:5000. Open a terminal in the project folder and run npm.cmd start, then retry.');
    }

    const responseText = await response.text();
    let result = {};
    if (responseText) {
      try {
        result = JSON.parse(responseText);
      } catch (error) {
        throw new Error('The backend returned an unexpected response. Open the site at http://localhost:5000 and ensure the Express server is running.');
      }
    }
    if (!response.ok) {
      if (response.status === 401 && token) {
        localStorage.removeItem(tokenKey);
      }
      throw new Error(result.message || `Request failed (${response.status}).`);
    }
    return result;
  }

  function showLoginMessage(text, type = 'danger') {
    const message = document.getElementById('loginMessage');
    if (!message) return;
    message.replaceChildren();
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = text;
    message.append(alert);
  }

  function clearLoginMessage() {
    document.getElementById('loginMessage')?.replaceChildren();
  }

  function showRegisterMessage(text, type = 'danger') {
    const target = document.getElementById('registerMessage');
    if (!target) {
      alert(text);
      return;
    }
    target.replaceChildren();
    const alertBox = document.createElement('div');
    alertBox.className = `alert alert-${type}`;
    alertBox.setAttribute('role', 'alert');
    alertBox.textContent = text;
    target.append(alertBox);
  }

  function currency(amount) {
    return `KES ${Number(amount || 0).toLocaleString()}`;
  }

  window.updateBalance = function updateBalance() {
    const formatted = currency(currentUser?.availableBalance);
    const balance = document.getElementById('balance');
    const walletBalance = document.getElementById('walletBalance');
    if (balance) balance.textContent = formatted;
    if (walletBalance) walletBalance.textContent = formatted;
  };

  window.updateLevelChallenge = function updateLevelChallenge() {
    const completed = Math.min(currentUser?.completedToday?.taskIds?.length || 0, 5);
    const remaining = 5 - completed;
    const progress = Math.round(completed / 5 * 100);
    const progressText = document.getElementById('levelProgressText');
    const percent = document.getElementById('levelProgressPercent');
    const bar = document.getElementById('levelProgressBar');
    const copy = document.getElementById('levelChallengeCopy');
    if (progressText) progressText.textContent = `${completed} of 5 tasks completed`;
    if (percent) percent.textContent = `${progress}%`;
    if (bar) bar.className = `progress-${progress}`;
    if (copy) {
      copy.textContent = remaining
        ? `Complete ${remaining} more task${remaining === 1 ? '' : 's'} to reach today's 5-task goal.`
        : 'Daily task goal complete.';
    }
  };

  function formatDate(value) {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }

  function isWithdrawalWindowOpen() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Nairobi',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date());
    const localTime = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const minutes = Number(localTime.hour) * 60 + Number(localTime.minute);
    return localTime.weekday === 'Fri' && minutes >= 420 && minutes <= 840;
  }

  function setVisibleState(isLoggedIn) {
    document.getElementById('loginPage')?.classList.toggle('is-hidden', isLoggedIn);
    document.getElementById('app')?.classList.toggle('is-visible', isLoggedIn);
  }

  window.showPage = function showPage(pageId, item) {
    const page = document.getElementById(pageId);
    if (!page || page.hidden) return;
    document.querySelectorAll('#app .page').forEach((section) => {
      section.classList.toggle('active', section === page);
    });
    document.querySelectorAll('#app .nav-item').forEach((navItem) => {
      navItem.classList.toggle('active', navItem === item);
    });
    document.getElementById('sidebar')?.classList.remove('open');
    window.scrollTo(0, 0);
  };

  window.toggleSidebar = function toggleSidebar() {
    document.getElementById('sidebar')?.classList.toggle('open');
  };

  window.openModal = function openModal(modalId) {
    document.getElementById(modalId)?.classList.add('is-open');
  };

  window.closeModal = function closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('is-open');
  };

  window.openRegister = function openRegister() {
    let modal = document.getElementById('registerModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'modal';
      modal.id = 'registerModal';
      modal.innerHTML = '<div class="modal-box"><div class="modal-header"><h2>Create your TaskEarn account</h2><button class="close" type="button" aria-label="Close">×</button></div><p class="u-color-64748b u-margin-bottom-20px">Create an account to access your member dashboard.</p><div id="registerMessage" aria-live="polite"></div><div class="form-group"><label for="registerName">Full Name</label><input id="registerName" autocomplete="name" placeholder="Your full name"></div><div class="form-group"><label for="registerEmail">Email Address</label><input type="email" id="registerEmail" autocomplete="email" placeholder="you@example.com"></div><div class="form-group"><label for="registerPassword">Password</label><input type="password" id="registerPassword" autocomplete="new-password" placeholder="Create a password"></div><div class="form-group"><label for="registerConfirm">Confirm Password</label><input type="password" id="registerConfirm" autocomplete="new-password" placeholder="Repeat your password"></div><button class="btn btn-primary full" type="button">Create Account</button></div>';
      modal.querySelector('.close').addEventListener('click', () => window.closeModal('registerModal'));
      modal.querySelector('.modal-box > .btn').addEventListener('click', () => window.createAccount());
      modal.addEventListener('click', (event) => {
        if (event.target === modal) window.closeModal('registerModal');
      });
      document.body.append(modal);
    }
    document.getElementById('registerMessage')?.replaceChildren();
    window.openModal('registerModal');
  };

  function removeUnavailableFeatures() {
    ['referrals', 'subscription', 'support'].forEach((pageId) => {
      document.getElementById(pageId)?.remove();
      document.querySelectorAll('.sidebar .nav-item').forEach((item) => {
        if (item.getAttribute('onclick')?.includes(`'${pageId}'`)) item.remove();
      });
    });
    document.querySelector('.referral-box')?.remove();
    document.querySelector('.notification')?.remove();
    document.querySelector('.login-box button[onclick="signInWithGoogle()"]')?.remove();
    document.getElementById('loginClaimModal')?.remove();
    document.querySelector('#dashboard > .alert-success')?.remove();
    document.querySelectorAll('.wallet-actions button').forEach((button) => {
      if (button.textContent.includes('Add Funds')) button.remove();
    });
    document.getElementById('depositModal')?.remove();
    document.querySelectorAll('#transactions select option').forEach((option) => {
      if (['Referral Commission', 'Deposits'].includes(option.textContent)) option.remove();
    });
  }

  function setupSubscriptionPayments() {
    const nav = document.querySelector('.sidebar .nav');
    const content = document.querySelector('#app .content');
    if (!nav || !content || document.getElementById('subscription-payments')) return;

    const navItem = document.createElement('div');
    navItem.className = 'nav-item';
    navItem.classList.add('subscription-nav-link');
    navItem.textContent = 'Subscription Payments';
    navItem.addEventListener('click', () => window.showPage('subscription-payments', navItem));
    nav.append(navItem);

    const page = document.createElement('section');
    page.className = 'page';
    page.id = 'subscription-payments';
    page.innerHTML = '<div class="page-title"><h1>Subscription payments</h1><p>Pay for your chosen plan, then upload the payment reference and receipt. Daily tasks unlock after an admin verifies your payment. Approval activates your plan and does not add money to your wallet.</p></div><div id="subscriptionPaymentMessage" aria-live="polite"></div><div class="card"><div class="form-group"><label for="subscriptionPlan">Requested plan</label><select id="subscriptionPlan"><option value="Basic">Basic</option><option value="Premium">Premium</option><option value="VIP">VIP</option></select></div><div class="form-group"><label for="paymentReference">Payment reference</label><input id="paymentReference" maxlength="100" placeholder="Enter the transaction reference"></div><div class="form-group"><label for="paymentProof">Payment receipt image (JPEG, PNG, or WebP; max 1 MB)</label><input id="paymentProof" type="file" accept="image/jpeg,image/png,image/webp"></div><button class="btn btn-primary" type="button" id="submitSubscriptionPayment">Submit for review</button> <button class="btn btn-light" type="button" id="refreshSubscriptionAccess">Refresh subscription status</button></div><div class="card"><h3>My payment submissions</h3><div class="table-wrapper"><table><thead><tr><th>Plan</th><th>Submitted</th><th>Status</th></tr></thead><tbody id="subscriptionPaymentRows"><tr><td colspan="3">No payment submissions yet.</td></tr></tbody></table></div></div>';
    content.append(page);
    document.getElementById('paymentProof').addEventListener('change', (event) => {
      selectedPaymentProof = '';
      const file = event.target.files[0];
      if (!file) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) {
        event.target.value = '';
        showSubscriptionPaymentMessage('Choose a JPEG, PNG, or WebP image no larger than 1 MB.');
        return;
      }
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        selectedPaymentProof = typeof reader.result === 'string' ? reader.result : '';
      });
      reader.addEventListener('error', () => {
        showSubscriptionPaymentMessage('The payment image could not be read. Please choose it again.');
      });
      reader.readAsDataURL(file);
    });
    document.getElementById('submitSubscriptionPayment').addEventListener('click', submitSubscriptionPayment);
    document.getElementById('refreshSubscriptionAccess').addEventListener('click', refreshSubscriptionAccess);
  }

  function showSubscriptionPaymentMessage(message, type = 'info') {
    const target = document.getElementById('subscriptionPaymentMessage');
    if (!target) return;
    target.replaceChildren();
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    target.append(alert);
  }

  async function loadSubscriptionPayments() {
    const { payments } = await apiRequest('/api/subscription/payments');
    const rows = document.getElementById('subscriptionPaymentRows');
    if (!rows) return;
    updateSubscriptionNotices(payments);
    rows.replaceChildren();
    if (!payments.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 3;
      cell.textContent = 'No payment submissions yet.';
      row.append(cell);
      rows.append(row);
      return;
    }
    payments.forEach((payment) => {
      const row = document.createElement('tr');
      [payment.requestedPlan, new Date(payment.createdAt).toLocaleString(), payment.status].forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      });
      rows.append(row);
    });
  }

  function updateSubscriptionNotices(payments = []) {
    const notices = document.querySelectorAll('#subscriptionAccessDashboard, #subscriptionAccessTasks');
    if (!notices.length || !currentUser || currentUser.role === 'senior_admin') return;
    if (currentUser.subscriptionActive) {
      notices.forEach((notice) => {
        notice.hidden = true;
        notice.replaceChildren();
      });
      return;
    }

    const latestPayment = payments[0];
    const message = latestPayment?.status === 'pending'
      ? 'Your payment is awaiting admin verification. Daily tasks will unlock after approval.'
      : latestPayment?.status === 'rejected'
        ? 'Your last payment was not approved. Submit a valid payment receipt to request verification and unlock daily tasks.'
        : 'An approved subscription is required to access daily tasks. Submit your subscription payment receipt for admin verification.';

    notices.forEach((notice) => {
      notice.hidden = false;
      notice.replaceChildren(document.createTextNode(message));
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-primary u-margin-left-10px';
      button.textContent = 'Subscription payments';
      button.addEventListener('click', () => {
        const navItem = document.querySelector('.sidebar .nav-item.subscription-nav-link');
        window.showPage('subscription-payments', navItem);
      });
      notice.append(document.createTextNode(' '), button);
    });
  }

  async function submitSubscriptionPayment() {
    const requestedPlan = document.getElementById('subscriptionPlan').value;
    const paymentReference = document.getElementById('paymentReference').value.trim();
    const file = document.getElementById('paymentProof').files[0];
    if (!paymentReference || !file || !selectedPaymentProof) {
      showSubscriptionPaymentMessage('Enter the payment reference and select a valid receipt image.', 'danger');
      return;
    }
    const button = document.getElementById('submitSubscriptionPayment');
    button.disabled = true;
    try {
      const result = await apiRequest('/api/subscription/payments', {
        method: 'POST',
        body: JSON.stringify({ requestedPlan, paymentReference, proof: selectedPaymentProof })
      });
      document.getElementById('paymentReference').value = '';
      document.getElementById('paymentProof').value = '';
      selectedPaymentProof = '';
      await loadSubscriptionPayments();
      showSubscriptionPaymentMessage(result.message, 'success');
    } catch (error) {
      showSubscriptionPaymentMessage(error.message, 'danger');
    } finally {
      button.disabled = false;
    }
  }

  async function refreshSubscriptionAccess() {
    const button = document.getElementById('refreshSubscriptionAccess');
    button.disabled = true;
    try {
      const data = await apiRequest('/api/dashboard');
      updateDashboard(data);
      await loadSubscriptionPayments();
      showSubscriptionPaymentMessage(data.subscriptionActive
        ? `Your ${data.user.plan} subscription is active. Daily tasks are now unlocked.`
        : 'Your subscription is not active yet. Tasks unlock after an admin approves your payment.', data.subscriptionActive ? 'success' : 'info');
    } catch (error) {
      showSubscriptionPaymentMessage(error.message, 'danger');
    } finally {
      button.disabled = false;
    }
  }

  const registerLink = document.createElement('button');
  registerLink.type = 'button';
  registerLink.className = 'btn btn-light full register-link';
  registerLink.textContent = 'Create an account';
  registerLink.addEventListener('click', () => window.openRegister());
  document.querySelector('.login-box .btn-primary')?.after(registerLink);
  removeUnavailableFeatures();

  function updateAccountHeader(user) {
    const name = user.name || user.email;
    const firstName = name.split(/\s+/)[0];
    const userName = document.querySelector('.user-mini strong');
    const avatar = document.querySelector('.user-mini .avatar');
    const roleName = document.querySelector('.user-mini small');
    const greeting = document.querySelector('#dashboard .page-title h1');
    if (userName) userName.textContent = firstName;
    if (avatar) avatar.textContent = name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    if (roleName) roleName.textContent = user.role === 'senior_admin'
      ? 'Senior Admin'
      : user.role === 'admin' ? 'Admin' : 'Member';
    if (greeting) greeting.textContent = `Good evening, ${firstName}`;
    document.querySelectorAll('#profile .profile-header p').forEach((item) => {
      item.textContent = user.email;
    });
    document.querySelectorAll('#profile .profile-header h2').forEach((item) => {
      item.textContent = user.name;
    });
    const profileAvatar = document.querySelector('#profile .big-avatar');
    if (profileAvatar) {
      profileAvatar.textContent = name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    }
    const profilePlan = document.getElementById('profilePlan');
    if (profilePlan) profilePlan.textContent = user.plan || 'Basic';
  }

  function updateDashboardLinks(role) {
    const nav = document.querySelector('.sidebar .nav');
    if (!nav) return;
    nav.querySelectorAll('.role-nav-link').forEach((link) => link.remove());
    if (role === 'admin' || role === 'senior_admin') {
      const adminLink = document.createElement('a');
      adminLink.className = 'nav-item role-nav-link';
      adminLink.href = '/admin';
      adminLink.style.textDecoration = 'none';
      adminLink.textContent = 'Admin Console';
      nav.append(adminLink);
    }
    if (role === 'senior_admin') {
      const seniorLink = document.createElement('a');
      seniorLink.className = 'nav-item role-nav-link';
      seniorLink.href = '/senior';
      seniorLink.style.textDecoration = 'none';
      seniorLink.textContent = 'Senior Dashboard';
      nav.append(seniorLink);
    }
  }

  function renderTransactions(transactions = []) {
    const recent = document.getElementById('transactionTable');
    const all = document.getElementById('transactionTableFull');
    if (recent) recent.replaceChildren();
    if (all) all.replaceChildren();

    transactions.forEach((transaction) => {
      const dateText = formatDate(transaction.date);
      const positive = Number(transaction.amount) >= 0;
      const status = transaction.status || 'completed';
      const statusClass = status === 'pending' ? 'pending' : status === 'failed' ? 'failed' : 'completed';
      const amountText = `${positive ? '+' : '-'}${currency(Math.abs(Number(transaction.amount)))}`;

      if (recent) {
        const row = document.createElement('tr');
        [dateText, transaction.description, amountText, status].forEach((value, index) => {
          const cell = document.createElement('td');
          if (index === 2) cell.className = positive ? 'u-color-16a34a' : 'u-color-dc2626';
          if (index === 3) {
            const badge = document.createElement('span');
            badge.className = `status ${statusClass}`;
            badge.textContent = status[0].toUpperCase() + status.slice(1);
            cell.append(badge);
          } else {
            cell.textContent = value;
          }
          row.append(cell);
        });
        recent.append(row);
      }

      if (all) {
        const row = document.createElement('tr');
        const type = transaction.description.toLowerCase().includes('withdraw')
          ? 'Withdrawal'
          : positive ? 'Earning' : 'Adjustment';
        const values = [transaction.id, dateText, type, transaction.description, amountText];
        values.forEach((value, index) => {
          const cell = document.createElement('td');
          cell.textContent = value;
          if (index === 4) cell.className = positive ? 'u-color-16a34a' : 'u-color-dc2626';
          row.append(cell);
        });
        const statusCell = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = `status ${statusClass}`;
        badge.textContent = status[0].toUpperCase() + status.slice(1);
        statusCell.append(badge);
        row.append(statusCell);
        all.append(row);
      }
    });
  }

  function updateDashboard(data) {
    currentUser = data.user;
    apiTasks = data.tasks;
    removeUnavailableFeatures();
    updateDashboardLinks(data.user.role);
    setupSubscriptionPayments();
    window.balance = data.stats.balance;
    window.updateBalance();
    window.updateLevelChallenge();
    updateAccountHeader(data.user);

    const balance = document.getElementById('balance');
    const totalEarnings = document.getElementById('totalEarnings');
    const tasksCompleted = document.getElementById('tasksCompleted');
    if (balance) balance.textContent = currency(data.stats.balance);
    if (totalEarnings) totalEarnings.textContent = currency(data.stats.totalEarnings);
    if (tasksCompleted) tasksCompleted.textContent = String(data.stats.tasksCompleted);

    const walletStats = document.querySelectorAll('#wallet .grid-3 h2');
    if (walletStats[0]) walletStats[0].textContent = currency(data.user.wallet.totalDeposits);
    if (walletStats[1]) walletStats[1].textContent = currency(data.user.wallet.totalWithdrawals);
    if (walletStats[2]) walletStats[2].textContent = currency(data.user.wallet.pendingWithdrawals);

    const completedTodayIds = data.user.completedToday?.taskIds || [];
    const completedToday = data.tasks.filter((task) => completedTodayIds.includes(task.id));
    const taskStats = document.querySelectorAll('#tasks .stats .amount');
    if (taskStats[0]) taskStats[0].textContent = currency(completedToday.reduce((total, task) => total + task.reward, 0));
    if (taskStats[1]) taskStats[1].textContent = `${completedToday.length} / ${data.tasks.length}`;
    if (taskStats[2]) taskStats[2].textContent = String(data.tasks.length - completedToday.length);

    const taskLists = document.querySelectorAll('#dashboard .task-list, #tasks .task-list');
    taskLists.forEach((list) => {
      list.replaceChildren();
      if (!data.tasks.length) {
        const message = document.createElement('p');
        message.className = 'muted';
        message.textContent = 'No tasks are available right now.';
        list.append(message);
        return;
      }

      data.tasks.forEach((task) => {
        const item = document.createElement('div');
        item.className = 'task';
        const info = document.createElement('div');
        info.className = 'task-info';
        const details = document.createElement('div');
        const title = document.createElement('h4');
        title.textContent = task.title;
        const description = document.createElement('p');
        description.textContent = task.description;
        details.append(title, description);
        if (task.video) {
          const link = document.createElement('a');
          link.href = task.video;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = 'Open task video';
          details.append(link);
        }
        info.append(details);
        const action = document.createElement('div');
        const reward = document.createElement('div');
        reward.className = 'reward';
        reward.textContent = `+${currency(task.reward)}`;
        const button = document.createElement('button');
        button.className = 'btn btn-success';
        button.textContent = task.available ? 'Complete' : 'Completed today';
        button.disabled = !task.available;
        button.onclick = () => window.completeTask(button, task.reward, task.title, task.id);
        action.append(reward, button);
        item.append(info, action);
        list.append(item);
      });
    });

    renderTransactions(data.user.transactions);
  }

  async function loadDashboard() {
    const result = await apiRequest('/api/dashboard');
    updateDashboard(result);
    await loadSubscriptionPayments();
    return result;
  }

  window.login = async function login() {
    if (busy) return;
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) {
      showLoginMessage('Please enter your email and password.', 'info');
      return;
    }

    busy = true;
    const button = document.querySelector('.login-box button[onclick="login()"]');
    if (button) {
      button.disabled = true;
      button.textContent = 'Signing in...';
    }
    try {
      const result = await apiRequest('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      localStorage.setItem(tokenKey, result.token);
      clearLoginMessage();
      if (result.user.role === 'admin') {
        window.location.replace('/admin');
        return;
      }
      if (result.user.role === 'senior_admin') {
        window.location.replace('/senior');
        return;
      }
      await loadDashboard();
      setVisibleState(true);
      showRenewalNotification();
    } catch (error) {
      showLoginMessage(error.message);
    } finally {
      busy = false;
      if (button) {
        button.disabled = false;
        button.textContent = 'Login';
      }
    }
  };

  window.createAccount = async function createAccount() {
    if (busy) return;
    document.getElementById('registerMessage')?.replaceChildren();
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim().toLowerCase();
    const password = document.getElementById('registerPassword').value;
    const confirm = document.getElementById('registerConfirm').value;
    if (!name || !email || !password || !confirm) {
      showRegisterMessage('Please complete all registration fields.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showRegisterMessage('Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      showRegisterMessage('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      showRegisterMessage('Passwords do not match.');
      return;
    }

    busy = true;
    const button = document.querySelector('#registerModal .btn-primary');
    if (button) {
      button.disabled = true;
      button.textContent = 'Creating account...';
    }
    try {
      const result = await apiRequest('/api/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password })
      });
      localStorage.setItem(tokenKey, result.token);
      closeModal('registerModal');
      await loadDashboard();
      setVisibleState(true);
      showRenewalNotification();
    } catch (error) {
      showRegisterMessage(error.message);
    } finally {
      busy = false;
      if (button) {
        button.disabled = false;
        button.textContent = 'Create Account';
      }
    }
  };

  window.completeTask = async function completeTask(button, amount, name, taskId) {
    if (busy || !localStorage.getItem(tokenKey)) {
      if (!localStorage.getItem(tokenKey)) alert('Please log in before completing tasks.');
      return;
    }
    const task = taskId
      ? apiTasks.find((item) => item.id === taskId)
      : apiTasks.find((item) => item.title === name);
    if (!task) {
      alert('This task is not available from the server. Refresh the page and try again.');
      return;
    }
    if (!task.available) {
      alert('You have already completed this task today.');
      return;
    }

    busy = true;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Processing...';
    try {
      const result = await apiRequest(`/api/tasks/${encodeURIComponent(task.id)}/complete`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      await loadDashboard();
      window.updateLevelChallenge();
      alert(`${result.message}\n${currency(result.reward)} has been added to your balance.`);
    } catch (error) {
      button.disabled = false;
      button.textContent = originalText;
      alert(error.message);
    } finally {
      busy = false;
    }
  };

  window.withdraw = async function withdraw() {
    if (busy) return;
    const amount = Number(document.getElementById('withdrawAmount').value);
    const account = document.getElementById('withdrawAccount').value.trim();
    if (!account) return alert('Please enter your account or phone number.');
    if (amount !== 500) return alert('The only available withdrawal amount is KES 500.');
    if (!isWithdrawalWindowOpen()) {
      return alert('Withdrawals are available only on Friday from 7:00 AM to 2:00 PM East Africa Time.');
    }
    if (amount > window.balance) return alert('Insufficient balance.');

    busy = true;
    try {
      const result = await apiRequest('/api/withdraw', {
        method: 'POST',
        body: JSON.stringify({
          amount,
          account,
          method: document.getElementById('withdrawMethod').value
        })
      });
      await loadDashboard();
      closeModal('withdrawModal');
      alert(`${result.message}\n\nAmount: ${currency(amount)}\n\nStatus: Pending verification`);
    } catch (error) {
      alert(error.message);
    } finally {
      busy = false;
    }
  };

  window.deposit = function deposit() {
    alert('Online deposits are not connected to a payment provider yet. No funds have been added.');
  };

  window.logout = async function logout() {
    const token = localStorage.getItem(tokenKey);
    try {
      if (token) await apiRequest('/api/logout', { method: 'POST' });
    } catch (error) {
      console.error('Server logout failed:', error);
    } finally {
      localStorage.removeItem(tokenKey);
      currentUser = null;
      apiTasks = [];
      updateDashboardLinks('member');
      setVisibleState(false);
    }
  };

  window.signInWithGoogle = function signInWithGoogle() {
    showLoginMessage('Google sign-in has not been configured on the backend yet. Use your email and password for now.', 'info');
  };

  const emailInput = document.getElementById('loginEmail');
  const emailLabel = document.querySelector('label[for="loginEmail"]');
  if (emailInput) {
    emailInput.type = 'email';
    emailInput.placeholder = 'you@example.com';
  }
  if (emailLabel) emailLabel.textContent = 'Email Address';

  async function restoreSession() {
    if (!localStorage.getItem(tokenKey)) return;
    try {
      const { user } = await apiRequest('/api/me');
      if (user.role === 'admin') {
        window.location.replace('/admin');
        return;
      }
      await loadDashboard();
      setVisibleState(true);
    } catch (error) {
      localStorage.removeItem(tokenKey);
      setVisibleState(false);
      showLoginMessage(
        error.message.includes('Unauthorized')
          ? 'Your session has expired. Please log in again.'
          : error.message,
        'info'
      );
    }
  }

  restoreSession();
})();
