(() => {
  const tokenKey = 'taskearnApiToken';
  const localHosts = new Set(['localhost', '127.0.0.1']);
  const apiBaseUrl = location.protocol === 'file:'
    || (localHosts.has(location.hostname) && location.port !== '5000')
    ? 'http://localhost:5000'
    : '';
  let apiTasks = [];
  let currentUser = null;
  let busy = false;

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
        ? `Complete ${remaining} more task${remaining === 1 ? '' : 's'} this week to unlock Premium benefits.`
        : 'Challenge complete. Premium benefits are ready to unlock.';
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

  function updateAccountHeader(user) {
    const name = user.name || user.email;
    const firstName = name.split(/\s+/)[0];
    const userName = document.querySelector('.user-mini strong');
    const avatar = document.querySelector('.user-mini .avatar');
    const greeting = document.querySelector('#dashboard .page-title h1');
    if (userName) userName.textContent = firstName;
    if (avatar) avatar.textContent = name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    if (greeting) greeting.textContent = `Good evening, ${firstName}`;
    document.querySelectorAll('#profile .profile-header p').forEach((item) => {
      item.textContent = user.email;
    });
    document.querySelectorAll('#profile .profile-header h2').forEach((item) => {
      item.textContent = user.name;
    });
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
    window.balance = data.stats.balance;
    window.updateBalance();
    window.updateLevelChallenge();
    updateAccountHeader(data.user);

    const amounts = document.querySelectorAll('#dashboard .stat-card .amount');
    if (amounts[0]) amounts[0].textContent = currency(data.stats.balance);
    if (amounts[1]) amounts[1].textContent = currency(data.stats.totalEarnings);
    if (amounts[2]) amounts[2].textContent = currency(data.stats.referralEarnings);
    if (amounts[3]) amounts[3].textContent = String(data.stats.tasksCompleted);

    const walletStats = document.querySelectorAll('#wallet .grid-3 h2');
    if (walletStats[0]) walletStats[0].textContent = currency(data.user.wallet.totalDeposits);
    if (walletStats[1]) walletStats[1].textContent = currency(data.user.wallet.totalWithdrawals);
    if (walletStats[2]) walletStats[2].textContent = currency(data.user.wallet.pendingWithdrawals);

    const builtInTitles = new Set([
      'Daily App Check',
      'Quick Survey',
      'Product Research',
      'App Engagement',
      'Survey',
      'Review Task'
    ]);
    document.querySelectorAll('#tasks .task-list .published-task').forEach((item) => item.remove());
    data.tasks.filter((task) => !builtInTitles.has(task.title)).forEach((task) => {
      const item = document.createElement('div');
      item.className = 'task published-task';
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
      document.querySelector('#tasks .task-list')?.append(item);
    });

    data.tasks.forEach((task) => {
      document.querySelectorAll('#dashboard .task button').forEach((button) => {
        const handler = button.getAttribute('onclick') || '';
        if (handler.includes(`'${task.title}'`)) {
          button.disabled = !task.available;
          if (!task.available) button.textContent = 'Completed today';
        }
      });
    });

    renderTransactions(data.user.transactions);
  }

  async function loadDashboard() {
    const result = await apiRequest('/api/dashboard');
    updateDashboard(result);
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
      const failures = JSON.parse(localStorage.getItem('taskearnLoginFailures') || '{}');
      delete failures[email];
      localStorage.setItem('taskearnLoginFailures', JSON.stringify(failures));
      clearLoginMessage();
      setVisibleState(true);
      await loadDashboard();
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
    const button = document.querySelector('#registerModal button[onclick="createAccount()"]');
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
      setVisibleState(true);
      await loadDashboard();
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
      setVisibleState(true);
      await loadDashboard();
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
