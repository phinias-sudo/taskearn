(() => {
  const tokenKey = 'taskearnApiToken';
  let currentRole = 'admin';
  const notice = document.getElementById('adminNotice');
  const userRows = document.getElementById('userRows');
  const taskRows = document.getElementById('taskRows');
  const withdrawalRows = document.getElementById('withdrawalRows');
  const paymentRows = document.getElementById('paymentRows');
  const headings = {
    overview: 'Platform Overview',
    users: 'Member Accounts',
    tasks: 'Published Tasks',
    payments: 'Subscription Payments',
    withdrawals: 'Withdrawal Requests'
  };

  function showNotice(message) {
    notice.textContent = message;
    notice.classList.add('visible');
  }

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (options.body) headers.set('Content-Type', 'application/json');
    const token = localStorage.getItem(tokenKey);
    if (token) headers.set('Authorization', `Bearer ${token}`);

    let response;
    try {
      response = await fetch(path, { ...options, headers });
    } catch (error) {
      throw new Error('Cannot reach the TaskEarn server. Refresh the page after the server is available.');
    }

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.message || `Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return result;
  }

  function cell(row, text) {
    const element = document.createElement('td');
    element.textContent = text;
    row.append(element);
    return element;
  }

  function emptyRow(target, columns, message) {
    const row = document.createElement('tr');
    const messageCell = cell(row, message);
    messageCell.colSpan = columns;
    target.replaceChildren(row);
  }

  function renderUser(user) {
    const row = document.createElement('tr');
    const member = document.createElement('td');
    const name = document.createElement('strong');
    const email = document.createElement('small');
    name.textContent = user.name;
    email.textContent = user.email;
    email.style.display = 'block';
    member.append(name, email);
    row.append(member);
    cell(row, user.plan || 'Basic');
    cell(row, user.status === 'suspended' ? 'Suspended' : 'Active');
    cell(row, `KES ${Number(user.availableBalance).toLocaleString()}`);
    cell(row, Number(user.tasksCompleted).toLocaleString());
    cell(row, new Date(user.createdAt).toLocaleDateString());
    const actions = cell(row, '');
    const statusButton = document.createElement('button');
    statusButton.type = 'button';
    statusButton.className = `btn ${user.status === 'suspended' ? 'success' : 'danger'}`;
    statusButton.textContent = user.status === 'suspended' ? 'Approve' : 'Suspend';
    statusButton.addEventListener('click', () => updateUserStatus(user, statusButton));
    actions.append(statusButton);
    if (currentRole === 'senior_admin') {
      const adjustButton = document.createElement('button');
      adjustButton.type = 'button';
      adjustButton.className = 'btn secondary';
      adjustButton.textContent = 'Adjust balance';
      adjustButton.addEventListener('click', () => adjustBalance(user, adjustButton));
      actions.append(document.createTextNode(' '), adjustButton);
    }
    userRows.append(row);
  }

  function renderPayment(payment) {
    const row = document.createElement('tr');
    cell(row, `${payment.memberName} (${payment.memberEmail})`);
    cell(row, payment.requestedPlan);
    cell(row, payment.paymentReference);
    const proofCell = cell(row, '');
    const proofLink = document.createElement('a');
    proofLink.href = `data:${payment.proofMimeType};base64,${payment.proofData}`;
    proofLink.target = '_blank';
    proofLink.rel = 'noopener noreferrer';
    proofLink.textContent = 'View proof';
    proofCell.append(proofLink);
    const statusCell = cell(row, '');
    const badge = document.createElement('span');
    badge.className = `badge ${payment.status}`;
    badge.textContent = payment.status[0].toUpperCase() + payment.status.slice(1);
    statusCell.append(badge);
    const decisionCell = cell(row, '');
    if (payment.status === 'pending') {
      ['approved', 'rejected'].forEach((status) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `btn ${status === 'approved' ? 'success' : 'danger'}`;
        button.textContent = status === 'approved' ? 'Approve' : 'Reject';
        button.addEventListener('click', () => reviewPayment(payment.id, status, button));
        decisionCell.append(button, document.createTextNode(' '));
      });
    }
    paymentRows.append(row);
  }

  function renderTask(task) {
    const row = document.createElement('tr');
    const details = document.createElement('td');
    const title = document.createElement('strong');
    const description = document.createElement('small');
    title.textContent = task.title;
    description.textContent = task.description;
    description.style.display = 'block';
    details.append(title, description);
    row.append(details);
    cell(row, task.category);
    cell(row, `KES ${Number(task.reward).toLocaleString()}`);
    cell(row, 'Published');
    taskRows.append(row);
  }

  function renderWithdrawal(withdrawal) {
    const row = document.createElement('tr');
    row.dataset.withdrawalId = withdrawal.id;
    cell(row, `WD-${withdrawal.id.slice(0, 8)}`);
    cell(row, `${withdrawal.memberName} (${withdrawal.memberEmail})`);
    cell(row, `${withdrawal.method} · ${withdrawal.account}`);
    cell(row, `KES ${Number(withdrawal.amount).toLocaleString()}`);
    cell(row, new Date(withdrawal.createdAt).toLocaleString());

    const statusCell = cell(row, '');
    const badge = document.createElement('span');
    badge.className = `badge ${withdrawal.status}`;
    badge.textContent = withdrawal.status[0].toUpperCase() + withdrawal.status.slice(1);
    statusCell.append(badge);

    const decisionCell = cell(row, '');
    if (withdrawal.status === 'pending') {
      ['approved', 'rejected'].forEach((status) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `btn ${status === 'approved' ? 'success' : 'danger'}`;
        button.textContent = status === 'approved' ? 'Approve' : 'Reject';
        button.addEventListener('click', () => reviewWithdrawal(button, status));
        decisionCell.append(button, document.createTextNode(' '));
      });
    } else {
      decisionCell.textContent = withdrawal.status === 'approved' ? 'Manual payout required' : 'Amount refunded';
    }
    withdrawalRows.append(row);
  }

  async function loadUsers() {
    const { users } = await request('/api/admin/users');
    if (!users.length) {
      emptyRow(userRows, 7, 'No member accounts have been created.');
      return;
    }
    userRows.replaceChildren();
    users.forEach(renderUser);
  }

  async function loadTasks() {
    const { tasks } = await request('/api/admin/tasks');
    if (!tasks.length) {
      emptyRow(taskRows, 4, 'No published tasks.');
      return;
    }
    taskRows.replaceChildren();
    tasks.forEach(renderTask);
  }

  async function loadPayments() {
    const { payments } = await request('/api/admin/subscription-payments');
    if (!payments.length) {
      emptyRow(paymentRows, 6, 'No subscription payment uploads have been submitted.');
      return;
    }
    paymentRows.replaceChildren();
    payments.forEach(renderPayment);
  }

  async function loadWithdrawals() {
    const { withdrawals } = await request('/api/admin/withdrawals');
    if (!withdrawals.length) {
      emptyRow(withdrawalRows, 7, 'No withdrawal requests have been submitted.');
      return;
    }
    withdrawalRows.replaceChildren();
    withdrawals.forEach(renderWithdrawal);
  }

  async function loadSummary() {
    const summary = await request('/api/admin/summary');
    document.getElementById('memberCount').textContent = summary.totalMembers.toLocaleString();
    document.getElementById('totalEarnings').textContent = `KES ${summary.totalEarnings.toLocaleString()}`;
    document.getElementById('pendingCount').textContent = summary.pendingWithdrawalRequests.toLocaleString();
    document.getElementById('completedCount').textContent = summary.tasksCompleted.toLocaleString();
  }

  async function reviewWithdrawal(button, status) {
    const withdrawalId = button.closest('tr')?.dataset.withdrawalId;
    if (!withdrawalId) return showNotice('The selected withdrawal request could not be identified.');
    button.disabled = true;
    try {
      const result = await request(`/api/admin/withdrawals/${encodeURIComponent(withdrawalId)}/review`, {
        method: 'POST',
        body: JSON.stringify({ status })
      });
      showNotice(result.message);
      await Promise.all([loadWithdrawals(), loadSummary()]);
    } catch (error) {
      button.disabled = false;
      showNotice(error.message);
    }
  }

  async function updateUserStatus(user, button) {
    const status = user.status === 'suspended' ? 'active' : 'suspended';
    button.disabled = true;
    try {
      await request(`/api/admin/users/${encodeURIComponent(user.id)}/status`, {
        method: 'POST',
        body: JSON.stringify({ status })
      });
      await loadUsers();
      showNotice(status === 'active' ? 'Member account approved.' : 'Member account suspended.');
    } catch (error) {
      button.disabled = false;
      showNotice(error.message);
    }
  }

  async function reviewPayment(paymentId, status, button) {
    button.disabled = true;
    try {
      const result = await request(`/api/admin/subscription-payments/${encodeURIComponent(paymentId)}/review`, {
        method: 'POST',
        body: JSON.stringify({ status })
      });
      const refresh = [loadPayments(), loadUsers()];
      if (currentRole === 'senior_admin') refresh.push(loadSummary());
      await Promise.all(refresh);
      showNotice(result.message);
    } catch (error) {
      button.disabled = false;
      showNotice(error.message);
    }
  }

  async function adjustBalance(user, button) {
    const amountText = window.prompt(`Balance adjustment for ${user.name}. Use a negative number to subtract:`);
    if (amountText === null) return;
    const amount = Number(amountText);
    if (!Number.isInteger(amount) || amount === 0) {
      showNotice('Enter a non-zero whole-number balance adjustment.');
      return;
    }
    const reason = window.prompt('Reason for this balance adjustment:');
    if (reason === null || !reason.trim()) {
      showNotice('A reason is required for each balance adjustment.');
      return;
    }
    button.disabled = true;
    try {
      await request(`/api/admin/users/${encodeURIComponent(user.id)}/balance-adjustments`, {
        method: 'POST',
        body: JSON.stringify({ amount, reason: reason.trim() })
      });
      await Promise.all([loadUsers(), loadSummary()]);
      showNotice('Balance adjustment recorded with its reason.');
    } catch (error) {
      button.disabled = false;
      showNotice(error.message);
    }
  }

  function setPage(pageName) {
    const page = document.getElementById(pageName);
    if (!page || page.hidden) return;
    document.querySelectorAll('.page').forEach((item) => item.classList.toggle('active', item === page));
    document.querySelectorAll('.nav button').forEach((button) => {
      button.classList.toggle('active', button.dataset.page === pageName);
    });
    document.getElementById('pageHeading').textContent = headings[pageName];
    history.replaceState(null, '', pageName === 'users' ? '/admin' : `/admin#${pageName}`);
  }

  async function addUser(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await request('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(values)
      });
      form.reset();
      form.hidden = true;
      await loadUsers();
      showNotice('Member account created.');
    } catch (error) {
      showNotice(error.message);
    } finally {
      submit.disabled = false;
    }
  }

  async function addTask(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await request('/api/admin/tasks', {
        method: 'POST',
        body: JSON.stringify(values)
      });
      form.reset();
      form.hidden = true;
      await loadTasks();
      showNotice('Task published.');
    } catch (error) {
      showNotice(error.message);
    } finally {
      submit.disabled = false;
    }
  }

  function configureRole(role) {
    currentRole = role;
    const isSeniorAdmin = role === 'senior_admin';
    document.querySelectorAll('.nav button').forEach((button) => {
      button.hidden = !isSeniorAdmin && !['users', 'tasks', 'payments'].includes(button.dataset.page);
    });
    document.querySelectorAll('.page').forEach((page) => {
      page.hidden = !isSeniorAdmin && !['users', 'tasks', 'payments'].includes(page.id);
    });

    const links = document.querySelector('.links');
    if (isSeniorAdmin) {
      const userLink = document.createElement('a');
      userLink.href = '/';
      userLink.textContent = 'User Dashboard';
      links.append(userLink);
      const seniorLink = document.createElement('a');
      seniorLink.href = '/senior';
      seniorLink.textContent = 'Senior Dashboard';
      links.append(seniorLink);
    }

    setPage(isSeniorAdmin ? (location.hash.slice(1) || 'overview') : 'users');
  }

  async function initialize() {
    try {
      const { user } = await request('/api/me');
      if (!['admin', 'senior_admin'].includes(user.role)) {
        window.location.replace('/');
        return;
      }

      configureRole(user.role);
      document.documentElement.classList.add('authorized');
      await loadUsers();
      if (user.role === 'senior_admin') {
        await Promise.all([loadSummary(), loadTasks(), loadWithdrawals()]);
      } else {
        await loadTasks();
      }
      await loadPayments();
    } catch (error) {
      if (error.status === 401) localStorage.removeItem(tokenKey);
      window.location.replace('/');
    }
  }

  document.querySelectorAll('.nav button').forEach((button) => {
    button.addEventListener('click', () => setPage(button.dataset.page));
  });
  document.getElementById('showAddUser').addEventListener('click', () => {
    document.getElementById('addUserForm').hidden = false;
  });
  document.getElementById('cancelAddUser').addEventListener('click', () => {
    document.getElementById('addUserForm').hidden = true;
  });
  document.getElementById('showAddTask').addEventListener('click', () => {
    document.getElementById('addTaskForm').hidden = false;
  });
  document.querySelectorAll('.cancel-form').forEach((button) => {
    button.addEventListener('click', () => {
      document.getElementById('addTaskForm').hidden = true;
    });
  });
  document.querySelector('#addTaskForm [name="type"]').addEventListener('change', (event) => {
    document.querySelector('.video-field').hidden = event.target.value !== 'video';
  });
  document.getElementById('addUserForm').addEventListener('submit', addUser);
  document.getElementById('addTaskForm').addEventListener('submit', addTask);
  document.querySelector('.logout').addEventListener('click', async () => {
    try {
      await request('/api/logout', { method: 'POST' });
    } catch (error) {
      console.error('Server logout failed:', error);
    } finally {
      localStorage.removeItem(tokenKey);
      window.location.replace('/');
    }
  });

  initialize();
})();
