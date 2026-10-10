(() => {
  const tokenKey = 'taskearnApiToken';
  const taskTable = document.querySelector('#tasks .table-card tbody');
  const withdrawalTable = document.querySelector('#withdrawals .table-card tbody');
  const userTable = document.getElementById('userRows');

  async function request(path, options = {}) {
    const token = localStorage.getItem(tokenKey);
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (options.body) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);

    let response;
    try {
      response = await fetch(path, { ...options, headers });
    } catch (error) {
      throw new Error('Cannot reach the TaskEarn server. Start the backend and try again.');
    }

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || `Request failed (${response.status}).`);
    return result;
  }

  function addNavigationLinks() {
    const actions = document.querySelector('.top-actions');
    if (!actions) return;
    [
      ['/', 'User Dashboard'],
      ['/senior', 'Senior Dashboard']
    ].forEach(([href, label]) => {
      if (actions.querySelector(`a[href="${href}"]`)) return;
      const link = document.createElement('a');
      link.href = href;
      link.className = 'btn light portal-link';
      link.textContent = label;
      actions.prepend(link);
    });
  }

  function renderPublishedTask(task) {
    if (!taskTable) return;
    const row = document.createElement('tr');
    row.className = 'api-task-row';
    const taskCell = document.createElement('td');
    const title = document.createElement('strong');
    title.textContent = task.title;
    const description = document.createElement('small');
    description.className = 'muted';
    description.textContent = task.description;
    taskCell.append(title, document.createElement('br'), description);

    [
      taskCell,
      document.createTextNode(task.category),
      document.createTextNode(`KES ${Number(task.reward).toLocaleString()}`),
      document.createTextNode('0'),
      null,
      null
    ].forEach((content, index) => {
      if (index === 0) {
        row.append(content);
        return;
      }
      const cell = document.createElement('td');
      if (index === 4) {
        const badge = document.createElement('span');
        badge.className = 'badge green';
        badge.textContent = 'Active';
        cell.append(badge);
      } else if (index === 5) {
        cell.textContent = 'Published';
      } else {
        cell.append(content);
      }
      row.append(cell);
    });
    taskTable.prepend(row);
  }

  function renderUser(user) {
    if (!userTable) return;
    const row = document.createElement('tr');
    row.dataset.name = `${user.name} ${user.email}`;
    row.dataset.plan = user.plan || 'Basic';
    row.dataset.status = 'Active';

    const memberCell = document.createElement('td');
    const member = document.createElement('div');
    member.className = 'member';
    const avatar = document.createElement('span');
    avatar.className = 'mini-avatar';
    avatar.textContent = user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    const details = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = user.name;
    const email = document.createElement('small');
    email.textContent = user.email;
    details.append(name, email);
    member.append(avatar, details);
    memberCell.append(member);
    row.append(memberCell);

    [
      user.plan || 'Basic',
      `KES ${Number(user.availableBalance).toLocaleString()}`,
      String(user.tasksCompleted),
      new Date(user.createdAt).toLocaleDateString()
    ].forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    });

    const statusCell = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'badge green';
    badge.textContent = 'Active';
    statusCell.append(badge);
    row.append(statusCell);
    const actionCell = document.createElement('td');
    const viewButton = document.createElement('button');
    viewButton.className = 'icon-btn';
    viewButton.textContent = 'View';
    viewButton.onclick = () => window.viewUser(user.name);
    actionCell.append(viewButton);
    row.append(actionCell);
    userTable.append(row);
  }

  async function loadSummary() {
    const notice = document.querySelector('#overview .notice');
    try {
      const summary = await request('/api/admin/summary');
      const overviewStats = document.querySelectorAll('#overview .stats .stat .value');
      if (document.getElementById('memberCount')) {
        document.getElementById('memberCount').textContent = summary.totalUsers.toLocaleString();
      }
      if (overviewStats[1]) overviewStats[1].textContent = `KES ${summary.totalEarnings.toLocaleString()}`;
      if (overviewStats[2]) overviewStats[2].textContent = `KES ${summary.pendingWithdrawals.toLocaleString()}`;
      if (overviewStats[3]) overviewStats[3].textContent = summary.tasksCompleted.toLocaleString();
      const pendingLabel = document.querySelector('#overview .stats .stat:nth-child(3) span');
      if (pendingLabel) {
        pendingLabel.textContent = `${summary.pendingWithdrawalRequests} request${summary.pendingWithdrawalRequests === 1 ? '' : 's'} need review`;
      }
      const queueStats = document.querySelectorAll('#withdrawals .stats .stat .value');
      if (queueStats[0]) queueStats[0].textContent = summary.pendingWithdrawalRequests.toLocaleString();
      if (queueStats[1]) queueStats[1].textContent = `KES ${summary.pendingWithdrawals.toLocaleString()}`;
      const queueNote = document.querySelector('#withdrawals .stats .stat:nth-child(2) .muted');
      if (queueNote) queueNote.textContent = `Across ${summary.pendingWithdrawalRequests} request${summary.pendingWithdrawalRequests === 1 ? '' : 's'}`;
      if (notice) {
        notice.textContent = 'Connected to the TaskEarn API. Accounts, tasks, and transactions are stored in memory and reset when the backend stops. Deposits and admin authorization are not connected to payment or approval services.';
      }
      const activityHeading = document.querySelector('#overview .grid-2 .card:nth-child(2) .card-head h2');
      if (activityHeading?.textContent === 'Live activity') activityHeading.textContent = 'Sample activity';
      const activityBadge = document.querySelector('#overview .grid-2 .card:nth-child(2) .badge');
      if (activityBadge) activityBadge.textContent = 'Sample';
    } catch (error) {
      if (notice) notice.textContent = `${error.message} Log in through the User Dashboard using an admin account, then return here.`;
    }
  }

  async function loadTasks() {
    if (!taskTable) return;
    try {
      const result = await request('/api/admin/tasks');
      taskTable.querySelectorAll('.api-task-row').forEach((row) => row.remove());
      result.tasks.forEach(renderPublishedTask);
    } catch (error) {
      console.error('Unable to load published tasks:', error);
    }
  }

  async function loadUsers() {
    if (!userTable) return;
    try {
      const result = await request('/api/admin/users');
      userTable.replaceChildren();
      result.users.forEach(renderUser);
    } catch (error) {
      console.error('Unable to load members:', error);
    }
  }

  async function loadWithdrawals() {
    if (!withdrawalTable) return;
    try {
      const result = await request('/api/admin/withdrawals');
      withdrawalTable.replaceChildren();
      if (!result.withdrawals.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 7;
        cell.textContent = 'No withdrawal requests have been submitted.';
        row.append(cell);
        withdrawalTable.append(row);
        return;
      }

      result.withdrawals.forEach((withdrawal) => {
        const row = document.createElement('tr');
        row.dataset.withdrawalId = withdrawal.id;
        const values = [
          `#WD-${withdrawal.id.slice(0, 8)}`,
          `${withdrawal.memberName} · ${withdrawal.memberEmail}`,
          `${withdrawal.method} · ${withdrawal.account}`,
          `KES ${Number(withdrawal.amount).toLocaleString()}`,
          new Date(withdrawal.createdAt).toLocaleString()
        ];
        values.forEach((value) => {
          const cell = document.createElement('td');
          cell.textContent = value;
          row.append(cell);
        });

        const statusCell = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = `badge ${withdrawal.status === 'pending' ? 'orange' : withdrawal.status === 'approved' ? 'green' : 'red'}`;
        badge.textContent = withdrawal.status[0].toUpperCase() + withdrawal.status.slice(1);
        statusCell.append(badge);
        row.append(statusCell);

        const decisionCell = document.createElement('td');
        if (withdrawal.status === 'pending') {
          decisionCell.className = 'actions';
          ['approved', 'rejected'].forEach((status) => {
            const button = document.createElement('button');
            button.className = `btn ${status === 'approved' ? 'success' : 'danger'}`;
            button.textContent = status === 'approved' ? 'Approve for payout' : 'Reject';
            button.onclick = () => window.processWithdrawal(button, status);
            decisionCell.append(button);
          });
        } else {
          decisionCell.textContent = withdrawal.status === 'approved' ? 'Manual payout required' : 'Amount refunded';
        }
        row.append(decisionCell);
        withdrawalTable.append(row);
      });
    } catch (error) {
      console.error('Unable to load withdrawal requests:', error);
    }
  }

  window.createTask = async function createTask() {
    const name = document.getElementById('taskName').value.trim();
    const type = document.getElementById('taskType').value;
    const reward = Number(document.getElementById('taskReward').value);
    const description = document.getElementById('taskDescription').value.trim();
    const video = document.getElementById('taskVideo').value.trim();
    if (!name || !reward || !description) {
      alert('Enter a task name, reward, and instruction or question.');
      return;
    }
    if (type === 'video' && !video) {
      alert('Add a video URL for a video task.');
      return;
    }

    const button = document.querySelector('#taskModal button[onclick="createTask()"]');
    if (button) {
      button.disabled = true;
      button.textContent = 'Publishing...';
    }
    try {
      const result = await request('/api/admin/tasks', {
        method: 'POST',
        body: JSON.stringify({ name, type, reward, description, video })
      });
      renderPublishedTask(result.task);
      closeModal('taskModal');
      ['taskName', 'taskReward', 'taskDescription', 'taskVideo'].forEach((id) => {
        document.getElementById(id).value = '';
      });
      demo(`${result.task.title} published for users with a KES ${result.task.reward} reward.`);
    } catch (error) {
      alert(error.message);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Publish task';
      }
    }
  };

  window.addUser = async function addUser() {
    const name = document.getElementById('newName').value.trim();
    const email = document.getElementById('newEmail').value.trim().toLowerCase();
    const password = document.getElementById('newPassword').value;
    const plan = document.getElementById('newPlan').value;
    if (!name || !email || !password) {
      alert('Enter the member name, email, and an initial password.');
      return;
    }
    if (password.length < 6) {
      alert('The initial password must be at least 6 characters.');
      return;
    }

    const button = document.querySelector('#addUserModal button[onclick="addUser()"]');
    if (button) {
      button.disabled = true;
      button.textContent = 'Creating...';
    }
    try {
      const result = await request('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, plan })
      });
      const user = result.user;
      renderUser(user);

      ['newName', 'newEmail', 'newPassword'].forEach((id) => {
        document.getElementById(id).value = '';
      });
      closeModal('addUserModal');
      demo(`Member ${user.name} created. Share the initial password with them securely.`);
      loadSummary();
    } catch (error) {
      alert(error.message);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Create user';
      }
    }
  };

  window.processWithdrawal = async function processWithdrawal(button, status) {
    const row = button.closest('tr');
    const withdrawalId = row?.dataset.withdrawalId;
    if (!withdrawalId) {
      alert('This is a sample withdrawal and cannot be reviewed through the API.');
      return;
    }
    button.disabled = true;
    try {
      const result = await request(`/api/admin/withdrawals/${encodeURIComponent(withdrawalId)}/review`, {
        method: 'POST',
        body: JSON.stringify({ status })
      });
      demo(result.message);
      await Promise.all([loadWithdrawals(), loadSummary()]);
    } catch (error) {
      button.disabled = false;
      alert(error.message);
    }
  };

  const logoutButton = document.querySelector('.logout');
  if (logoutButton) {
    logoutButton.onclick = async () => {
      try {
        if (localStorage.getItem(tokenKey)) {
          await request('/api/logout', { method: 'POST' });
        }
      } catch (error) {
        alert(error.message);
      } finally {
        localStorage.removeItem(tokenKey);
        window.location.href = '/';
      }
    };
  }

  addNavigationLinks();
  loadSummary();
  loadTasks();
  loadUsers();
  loadWithdrawals();
})();
