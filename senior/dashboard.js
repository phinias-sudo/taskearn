(() => {
  const tokenKey = 'taskearnToken';
  const notice = document.getElementById('dashboardNotice');

  function showNotice(message) {
    if (!notice) return;
    notice.textContent = message;
    notice.classList.add('visible');
  }

  async function request(path) {
    const token = localStorage.getItem(tokenKey);
    const headers = new Headers({ Accept: 'application/json' });
    if (token) headers.set('Authorization', `Bearer ${token}`);

    let response;
    try {
      response = await fetch(path, { headers });
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

  function addNavigationLinks() {
    const actions = document.querySelector('.top-actions');
    [
      ['/', 'User Dashboard'],
      ['/admin', 'Admin Console']
    ].forEach(([href, label]) => {
      const link = document.createElement('a');
      link.href = href;
      link.textContent = label;
      actions.append(link);
    });
  }

  function renderSummary(summary) {
    document.getElementById('memberCount').textContent = summary.totalMembers.toLocaleString();
    document.getElementById('totalEarnings').textContent = `KES ${summary.totalEarnings.toLocaleString()}`;
    document.getElementById('pendingWithdrawals').textContent = summary.pendingWithdrawalRequests.toLocaleString();
    document.getElementById('tasksCompleted').textContent = summary.tasksCompleted.toLocaleString();
    document.querySelectorAll('.value').forEach((value) => value.classList.remove('loading'));
  }

  function configureAdminCreation() {
    const form = document.getElementById('createAdminForm');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const values = Object.fromEntries(new FormData(form));
      button.disabled = true;
      try {
        const token = localStorage.getItem(tokenKey);
        const response = await fetch('/api/senior/admins', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(values)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || `Request failed (${response.status}).`);
        form.reset();
        notice.classList.remove('success');
        showNotice(result.message);
        notice.classList.add('success');
      } catch (error) {
        notice.classList.remove('success');
        showNotice(error.message);
      } finally {
        button.disabled = false;
      }
    });
  }

  async function initialize() {
    try {
      const { user } = await request('/api/me');
      if (user.role !== 'senior_admin') {
        window.location.replace(user.role === 'admin' ? '/admin' : '/');
        return;
      }

      addNavigationLinks();
      configureAdminCreation();
      const summary = await request('/api/admin/summary');
      renderSummary(summary);
      document.documentElement.classList.add('authorized');
    } catch (error) {
      if (error.status === 401) {
        localStorage.removeItem(tokenKey);
        window.location.replace('/');
        return;
      }
      if (error.status === 403) {
        window.location.replace('/');
        return;
      }
      showNotice(error.message);
      document.documentElement.classList.add('authorized');
    }
  }

  initialize();
})();
