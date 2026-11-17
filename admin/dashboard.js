(() => {
  const tokenKey = 'taskearnToken';
  let currentRole = 'admin';
  const notice = document.getElementById('adminNotice');
  const userRows = document.getElementById('userRows');
  const taskRows = document.getElementById('taskRows');
  const withdrawalRows = document.getElementById('withdrawalRows');
  const paymentRows = document.getElementById('paymentRows');
  let userPagination = { page: 1, limit: 25, total: 0, totalPages: 1 };
  let userRequestId = 0;
  let userSearchTimer;
  let currentUserId = '';
  let visibleUsers = [];
  let selectedUserIds = new Set();
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

  function showAuthError(message) {
    document.getElementById('adminAuthMessage').textContent = message;
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
    const selectionCell = document.createElement('td');
    const selection = document.createElement('input');
    selection.type = 'checkbox';
    selection.className = 'user-selection';
    selection.checked = selectedUserIds.has(user.id);
    selection.disabled = user.id === currentUserId;
    selection.setAttribute('aria-label', `Select ${user.name}`);
    selection.addEventListener('change', () => {
      if (selection.checked) selectedUserIds.add(user.id);
      else selectedUserIds.delete(user.id);
      updateBulkControls();
    });
    selectionCell.append(selection);
    row.append(selectionCell);
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
    cell(row, user.subscriptionActive ? 'Active' : 'Inactive');
    cell(row, `KES ${Number(user.availableBalance).toLocaleString()}`);
    cell(row, Number(user.tasksCompleted).toLocaleString());
    cell(row, new Date(user.createdAt).toLocaleDateString());
    const actions = cell(row, '');
    const statusButton = document.createElement('button');
    statusButton.type = 'button';
    statusButton.className = `btn ${user.status === 'suspended' ? 'success' : 'danger'}`;
    statusButton.textContent = user.status === 'suspended' ? 'Reactivate' : 'Suspend';
    statusButton.disabled = user.id === currentUserId;
    if (user.id === currentUserId) {
      statusButton.textContent = 'Current account';
    } else {
      statusButton.addEventListener('click', () => updateUserStatus(user, statusButton));
    }
    actions.append(statusButton);
    if (user.id !== currentUserId) {
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'btn danger';
      deleteButton.textContent = 'Remove';
      deleteButton.addEventListener('click', () => removeUser(user, deleteButton));
      actions.append(document.createTextNode(' '), deleteButton);
    }
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
    cell(row, Number.isInteger(payment.requestedLevel)
      ? `Level ${payment.requestedLevel} (${payment.requestedPlan}) - KES ${Number(payment.amount).toLocaleString()}`
      : `${payment.requestedPlan} (legacy payment; amount not recorded)`);
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

  async function loadUsers(page = userPagination.page) {
    selectedUserIds.clear();
    updateBulkControls();
    const params = new URLSearchParams({
      page: String(page),
      limit: document.getElementById('userPageSize').value,
      search: document.getElementById('userSearch').value.trim(),
      status: document.getElementById('userStatusFilter').value,
      subscription: document.getElementById('userSubscriptionFilter').value
    });
    const requestId = ++userRequestId;
    const result = await request(`/api/admin/users?${params}`);
    if (requestId !== userRequestId) return;
    if (page > result.pagination.totalPages) {
      return loadUsers(result.pagination.totalPages);
    }
    userPagination = result.pagination;
    renderUsers(result.users);
  }

  function renderUsers(users) {
    const { page, limit, total, totalPages } = userPagination;
    const firstAccount = total ? (page - 1) * limit + 1 : 0;
    const lastAccount = Math.min(page * limit, total);
    document.getElementById('userCount').textContent = `Showing ${firstAccount}-${lastAccount} of ${total} accounts`;
    document.getElementById('userPageLabel').textContent = `Page ${page} of ${totalPages}`;
    document.getElementById('previousUsersPage').disabled = page <= 1;
    document.getElementById('nextUsersPage').disabled = page >= totalPages;

    if (!users.length) {
      const hasFilters = document.getElementById('userSearch').value.trim()
        || document.getElementById('userStatusFilter').value
        || document.getElementById('userSubscriptionFilter').value;
      visibleUsers = [];
      updateBulkControls();
      emptyRow(userRows, 9, hasFilters ? 'No accounts match these filters.' : 'No member accounts have been created.');
      return;
    }
    visibleUsers = users;
    userRows.replaceChildren();
    users.forEach(renderUser);
    updateBulkControls();
  }

  function updateBulkControls() {
    const manageableIds = visibleUsers.filter((user) => user.id !== currentUserId).map((user) => user.id);
    const selectedCount = selectedUserIds.size;
    document.getElementById('selectedUserCount').textContent =
      `${selectedCount} selected on this page`;
    document.getElementById('bulkSuspendUsers').disabled = selectedCount === 0;
    document.getElementById('bulkActivateUsers').disabled = selectedCount === 0;
    const selectVisible = document.getElementById('selectVisibleUsers');
    selectVisible.checked = manageableIds.length > 0 && manageableIds.every((id) => selectedUserIds.has(id));
    selectVisible.indeterminate = selectedCount > 0 && !selectVisible.checked;
    selectVisible.disabled = manageableIds.length === 0;
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
    const action = status === 'active' ? 'reactivate' : 'suspend';
    if (!window.confirm(`Are you sure you want to ${action} ${user.name}'s account?`)) return;
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

  async function updateSelectedUsers(status, button) {
    const userIds = [...selectedUserIds];
    if (!userIds.length) return;
    const action = status === 'active' ? 'reactivate' : 'suspend';
    if (!window.confirm(`${action[0].toUpperCase()}${action.slice(1)} ${userIds.length} selected account${userIds.length === 1 ? '' : 's'}?`)) return;

    button.disabled = true;
    try {
      const result = await request('/api/admin/users/bulk-status', {
        method: 'POST',
        body: JSON.stringify({ userIds, status })
      });
      await loadUsers();
      showNotice(result.message);
    } catch (error) {
      showNotice(error.message);
    } finally {
      button.disabled = false;
    }
  }

  async function removeUser(user, button) {
    const confirmed = window.confirm(
      `Remove ${user.name}'s account from the admin dashboard? They will lose access immediately. Account, payment, and transaction history will be retained.`
    );
    if (!confirmed) return;
    button.disabled = true;
    try {
      const result = await request(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      await loadUsers();
      showNotice(result.message);
    } catch (error) {
      button.disabled = false;
      showNotice(error.message);
    }
  }

  function csvField(value) {
    let text = String(value ?? '');
    if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }

  async function exportUsers(button) {
    button.disabled = true;
    try {
      const filters = new URLSearchParams({
        limit: '100',
        search: document.getElementById('userSearch').value.trim(),
        status: document.getElementById('userStatusFilter').value,
        subscription: document.getElementById('userSubscriptionFilter').value
      });
      const firstPage = await request(`/api/admin/users?${filters}&page=1`);
      const users = [...firstPage.users];
      for (let page = 2; page <= firstPage.pagination.totalPages; page += 1) {
        const params = new URLSearchParams(filters);
        params.set('page', String(page));
        const result = await request(`/api/admin/users?${params}`);
        users.push(...result.users);
      }

      const columns = ['Account ID', 'Name', 'Email', 'Role', 'Plan', 'Account status', 'Subscription', 'Balance (KES)', 'Tasks completed', 'Joined'];
      const rows = users.map((user) => [
        user.id,
        user.name,
        user.email,
        user.role,
        user.plan || 'Basic',
        user.status,
        user.subscriptionActive ? 'Active' : 'Inactive',
        user.availableBalance,
        user.tasksCompleted,
        user.createdAt
      ]);
      const csv = `\uFEFF${[columns, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n')}`;
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `taskearn-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      showNotice(`Exported ${users.length} account${users.length === 1 ? '' : 's'} to CSV.`);
    } catch (error) {
      showNotice(`CSV export failed: ${error.message}`);
    } finally {
      button.disabled = false;
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
      await loadUsers(1);
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
      button.hidden = !isSeniorAdmin && !['overview', 'users', 'tasks', 'payments'].includes(button.dataset.page);
    });
    document.querySelectorAll('.page').forEach((page) => {
      page.hidden = !isSeniorAdmin && !['overview', 'users', 'tasks', 'payments'].includes(page.id);
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

    const requestedPage = location.hash.slice(1);
    const adminPages = ['overview', 'users', 'tasks', 'payments'];
    setPage(!isSeniorAdmin && requestedPage && !adminPages.includes(requestedPage)
      ? 'overview'
      : requestedPage || 'overview');
  }

  async function initialize() {
    try {
      const { user } = await request('/api/me');
      if (!['admin', 'senior_admin'].includes(user.role)) {
        showAuthError('This account does not have administrator access. Sign in with an admin account.');
        return;
      }

      currentUserId = user.id;
      configureRole(user.role);
      await loadUsers();
      if (user.role === 'senior_admin') {
        await Promise.all([loadSummary(), loadTasks(), loadWithdrawals()]);
      } else {
        await Promise.all([loadSummary(), loadTasks()]);
      }
      await loadPayments();
      document.documentElement.classList.add('authorized');
    } catch (error) {
      if (error.status === 401) localStorage.removeItem(tokenKey);
      showAuthError(error.status === 401
        ? 'Your administrator session is missing or expired. Return to sign in and log in again.'
        : `The admin dashboard could not load: ${error.message}`);
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
  document.getElementById('selectVisibleUsers').addEventListener('change', (event) => {
    visibleUsers.forEach((user) => {
      if (user.id === currentUserId) return;
      if (event.currentTarget.checked) selectedUserIds.add(user.id);
      else selectedUserIds.delete(user.id);
    });
    userRows.querySelectorAll('.user-selection').forEach((checkbox) => {
      if (!checkbox.disabled) checkbox.checked = event.currentTarget.checked;
    });
    updateBulkControls();
  });
  document.getElementById('bulkSuspendUsers').addEventListener('click', (event) => {
    updateSelectedUsers('suspended', event.currentTarget);
  });
  document.getElementById('bulkActivateUsers').addEventListener('click', (event) => {
    updateSelectedUsers('active', event.currentTarget);
  });
  document.getElementById('exportUsers').addEventListener('click', (event) => {
    exportUsers(event.currentTarget);
  });
  document.getElementById('userSearch').addEventListener('input', () => {
    window.clearTimeout(userSearchTimer);
    userSearchTimer = window.setTimeout(() => {
      loadUsers(1).catch((error) => showNotice(error.message));
    }, 250);
  });
  ['userStatusFilter', 'userSubscriptionFilter', 'userPageSize'].forEach((id) => {
    document.getElementById(id).addEventListener('change', () => {
      loadUsers(1).catch((error) => showNotice(error.message));
    });
  });
  document.getElementById('previousUsersPage').addEventListener('click', () => {
    loadUsers(userPagination.page - 1).catch((error) => showNotice(error.message));
  });
  document.getElementById('nextUsersPage').addEventListener('click', () => {
    loadUsers(userPagination.page + 1).catch((error) => showNotice(error.message));
  });
  document.getElementById('refreshUsers').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await loadUsers();
    } catch (error) {
      showNotice(error.message);
    } finally {
      button.disabled = false;
    }
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
