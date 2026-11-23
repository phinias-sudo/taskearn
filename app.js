(() => {
   const tokenKey = 'taskearnToken';
  const apiBase = location.protocol === 'file:' ? 'http://localhost:5000' : '';
  let apiTasks = [];
  let currentUser = null;
  let busy = false;
  let selectedPaymentProof = '';
  let referralSummaryRequest = 0;
  let currentWithdrawalSchedule = null;

  async function apiRequest(url, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (options.body) headers.set('Content-Type', 'application/json');

    const token = localStorage.getItem(tokenKey);
    if (token) headers.set('Authorization', `Bearer ${token}`);

    let response;
    try {
      response = await fetch(`${apiBase}${url}`, { ...options, headers });
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
      if (response.status === 401 && token && localStorage.getItem(tokenKey) === token) {
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
    if (!currentWithdrawalSchedule || !currentUser) return true;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Nairobi',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date());
    const localTime = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const minutes = Number(localTime.hour) * 60 + Number(localTime.minute);
    return currentWithdrawalSchedule.some((slot) => {
      const start = Number(slot.start.slice(0, 2)) * 60 + Number(slot.start.slice(3));
      const end = Number(slot.end.slice(0, 2)) * 60 + Number(slot.end.slice(3));
      return slot.days.includes(localTime.weekday) && minutes >= start && minutes < end;
    });
  }

  function formatWithdrawalSchedule(schedule) {
    if (!Array.isArray(schedule) || !schedule.length) return 'No withdrawal schedule is available.';
    const dayNames = { Tue: 'Tuesday', Fri: 'Friday', Sun: 'Sunday' };
    const formatTime = (time) => {
      const [hour, minute] = time.split(':').map(Number);
      const period = hour >= 12 ? 'PM' : 'AM';
      return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${period}`;
    };
    return `${schedule.map((slot) => (
      `${slot.days.map((day) => dayNames[day]).join(' and ')} ${formatTime(slot.start)}-${formatTime(slot.end)}`
    )).join('; ')} East Africa Time.`;
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
    ['subscription', 'support'].forEach((pageId) => {
      document.getElementById(pageId)?.remove();
      document.querySelectorAll('.sidebar .nav-item').forEach((item) => {
        if (item.getAttribute('onclick')?.includes(`'${pageId}'`)) item.remove();
      });
    });
    document.querySelector('.notification')?.remove();
    document.getElementById('loginClaimModal')?.remove();
    document.querySelector('#dashboard > .alert-success')?.remove();
    document.querySelectorAll('.wallet-actions button').forEach((button) => {
      if (button.textContent.includes('Add Funds')) button.remove();
    });
    document.getElementById('depositModal')?.remove();
    document.querySelectorAll('#transactions select option').forEach((option) => {
      if (option.textContent === 'Deposits') option.remove();
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
    page.innerHTML = '<div class="page-title"><h1>Subscription payments</h1><p>Select one of the 30 levels and pay the listed amount. Your subscription and any referral commission activate only after an admin verifies your payment.</p></div><div id="subscriptionPaymentMessage" aria-live="polite"></div><div class="card"><div class="form-group"><label for="subscriptionLevel">Subscription level</label><select id="subscriptionLevel" required><option value="">Loading levels…</option></select><p class="muted" id="subscriptionLevelDetails">The selected level determines your subscription fee.</p></div><div class="form-group"><label for="paymentReference">Payment reference</label><input id="paymentReference" maxlength="100" placeholder="Enter the transaction reference"></div><div class="form-group"><label for="paymentProof">Payment receipt image (JPEG, PNG, or WebP; max 1 MB)</label><input id="paymentProof" type="file" accept="image/jpeg,image/png,image/webp"></div><button class="btn btn-primary" type="button" id="submitSubscriptionPayment">Submit for review</button> <button class="btn btn-light" type="button" id="refreshSubscriptionAccess">Refresh subscription status</button></div><div class="card"><h3>My payment submissions</h3><div class="table-wrapper"><table><thead><tr><th>Level and amount</th><th>Submitted</th><th>Status</th></tr></thead><tbody id="subscriptionPaymentRows"><tr><td colspan="3">No payment submissions yet.</td></tr></tbody></table></div></div>';
    content.append(page);
    void loadSubscriptionLevels();
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
    updateSubscriptionPaymentAvailability();
  }

  function setupLevelBenefits() {
    if (currentUser?.role !== 'member') return;
    const nav = document.querySelector('.sidebar .nav');
    const content = document.querySelector('#app .content');
    if (!nav || !content || document.getElementById('level-benefits')) return;

    const navItem = document.createElement('div');
    navItem.className = 'nav-item level-benefits-nav-link';
    navItem.textContent = 'Level Benefits';
    navItem.addEventListener('click', () => window.showPage('level-benefits', navItem));
    nav.append(navItem);

    const page = document.createElement('section');
    page.className = 'page';
    page.id = 'level-benefits';
    page.innerHTML = '<div class="page-title"><h1>Level Benefits</h1><p>Compare subscription fees, referral commissions, and withdrawal times for every level.</p></div><div class="card"><p class="muted">Referral commission is credited after subscription approval: the standard rate is 10%; it is 20% only when both registration and approval occur on a weekend. All withdrawal hours use East Africa Time.</p><div class="level-table-wrap"><table class="level-table"><thead><tr><th>Level</th><th>Plan</th><th>Subscription amount</th><th>Referral commission</th><th>Withdrawal schedule</th></tr></thead><tbody id="levelBenefitsRows"><tr><td colspan="5">Loading levels…</td></tr></tbody></table></div></div>';
    content.append(page);
  }

  async function loadSubscriptionLevels() {
    try {
      const { levels } = await apiRequest('/api/subscription/levels');
      const select = document.getElementById('subscriptionLevel');
      const details = document.getElementById('subscriptionLevelDetails');
      const tableBody = document.getElementById('levelBenefitsRows');
      if (!select && !tableBody) return;

      if (select) {
        select.replaceChildren(new Option('Choose a subscription level', ''));
      }
      if (tableBody) tableBody.replaceChildren();

      levels.forEach((level) => {
        if (select) {
          const option = new Option(
            `Level ${level.level} (${level.plan}) - ${currency(level.amount)}`,
            String(level.level)
          );
          select.append(option);
        }
        if (!tableBody) return;

        const row = document.createElement('tr');
        row.dataset.level = String(level.level);
        row.classList.add('plan-row', `plan-${level.plan.toLowerCase()}`);
        if (currentUser?.level === level.level) row.classList.add('current-level');
        const referral = `${level.weekdayReferralCommission.rate * 100}% standard (${currency(level.weekdayReferralCommission.amount)}); ${level.weekendReferralCommission.rate * 100}% if registration and approval are both on a weekend (${currency(level.weekendReferralCommission.amount)})`;
        [
          `Level ${level.level}`,
          level.plan,
          currency(level.amount),
          referral,
          formatWithdrawalSchedule(level.withdrawalSchedule)
        ].forEach((value, index) => {
          const cell = document.createElement('td');
          cell.textContent = value;
          if (index === 0) cell.className = 'level-number';
          if (index === 2) cell.className = 'price';
          if (index === 3) cell.className = 'benefit';
          row.append(cell);
        });
        tableBody.append(row);
      });
      if (select) {
        select.addEventListener('change', () => {
          const level = levels.find((item) => item.level === Number(select.value));
          if (details) {
            details.textContent = level
              ? `Level ${level.level} (${level.plan}) costs ${currency(level.amount)}.`
              : 'The selected level determines your subscription fee.';
          }
        });
      }
      if (!levels.length) {
        if (tableBody) {
          const row = document.createElement('tr');
          const cell = document.createElement('td');
          cell.colSpan = 5;
          cell.textContent = 'No subscription levels are available.';
          row.append(cell);
          tableBody.append(row);
        }
      }
    } catch (error) {
      showSubscriptionPaymentMessage(`Subscription levels could not be loaded: ${error.message}`, 'danger');
    }
  }

  function setupReferralDashboard() {
    if (currentUser?.role !== 'member') return;
    const nav = document.querySelector('.sidebar .nav');
    const content = document.querySelector('#app .content');
    if (!nav || !content) return;
    if (document.getElementById('referrals')) {
      void loadReferralSummary();
      return;
    }

    const navItem = document.createElement('div');
    navItem.className = 'nav-item';
    navItem.classList.add('referral-nav-link');
    navItem.textContent = 'Referrals';
    navItem.addEventListener('click', () => window.showPage('referrals', navItem));
    nav.append(navItem);

    const page = document.createElement('section');
    page.className = 'page';
    page.id = 'referrals';
    page.innerHTML = '<div class="page-title"><h1>Referrals</h1><p>Share your unique link and earn a wallet commission after your referral’s subscription is approved.</p></div><div class="stats"><div class="card"><h3>People referred</h3><div class="amount" id="referralTotal">0</div></div><div class="card"><h3>Activated</h3><div class="amount" id="referralActivated">0</div></div><div class="card"><h3>Awaiting activation</h3><div class="amount" id="referralAwaiting">0</div></div><div class="card"><h3>Total referral earnings</h3><div class="amount" id="referralEarnings">KES 0</div></div></div><div class="card referral-group-card"><div class="referral-group-heading"><div><span class="eyebrow">FIRST REFERRAL GROUP</span><h3>One-time group reward</h3><p id="referralGroupProgress">0 of 12 eligible activations</p></div><strong id="referralGroupBonus">15% bonus</strong></div><div class="referral-group-track" role="progressbar" aria-label="First referral group progress" aria-valuemin="0" aria-valuemax="12" aria-valuenow="0"><span id="referralGroupProgressBar"></span></div><p class="muted" id="referralGroupDetails">Complete a group of 12 referrals with approved subscriptions and recorded initial fees to earn 15% of their combined subscription amount.</p></div><div class="card"><h3>Your referral link</h3><p class="muted">New members who register using this link will be attributed to your account.</p><div class="form-group"><label for="referralLink">Unique link</label><input id="referralLink" type="url" readonly></div><button class="btn btn-primary" type="button" id="copyReferralLink">Copy link</button> <button class="btn btn-light" type="button" id="refreshReferralSummary">Refresh</button><p id="referralMessage" aria-live="polite"></p></div><div class="card"><h3>Commission rules</h3><p>10% is the standard referral commission. 20% applies only when both registration and subscription approval occur on a weekend in Africa/Nairobi time. Commission is credited to your wallet after admin approval.</p><p class="muted">A referred member is counted as activated after their subscription is approved.</p></div>';
    content.append(page);
    document.getElementById('copyReferralLink').addEventListener('click', copyReferralLink);
    document.getElementById('refreshReferralSummary').addEventListener('click', loadReferralSummary);
    void loadReferralSummary();
  }

  async function loadReferralSummary() {
    const requestId = ++referralSummaryRequest;
    const message = document.getElementById('referralMessage');
    const refreshButton = document.getElementById('refreshReferralSummary');
    if (refreshButton) refreshButton.disabled = true;
    try {
      const summary = await apiRequest('/api/referrals');
      if (requestId !== referralSummaryRequest || !document.getElementById('referrals')) return;
      const referralUrl = new URL('/', location.origin);
      referralUrl.searchParams.set('ref', summary.referralCode);
      document.getElementById('referralLink').value = referralUrl.toString();
      document.getElementById('referralTotal').textContent = String(summary.total);
      document.getElementById('referralActivated').textContent = String(summary.activated);
      document.getElementById('referralAwaiting').textContent = String(summary.awaitingActivation);
      document.getElementById('referralEarnings').textContent = currency(summary.referralEarnings);
      document.getElementById('referralGroupProgress').textContent =
        `${summary.firstGroupProgress} of ${summary.firstGroupSize} eligible activations`;
      document.getElementById('referralGroupProgressBar').style.width =
        `${(summary.firstGroupProgress / summary.firstGroupSize) * 100}%`;
      document.querySelector('.referral-group-track')
        .setAttribute('aria-valuenow', String(summary.firstGroupProgress));
      document.getElementById('referralGroupBonus').textContent = summary.firstGroupBonusAwarded
        ? `${currency(summary.firstGroupBonusAmount)} paid`
        : '15% bonus';
      document.getElementById('referralGroupDetails').textContent = summary.firstGroupBonusAwarded
        ? `Your first group’s 12 recorded initial subscription fees totaled ${currency(summary.firstGroupBonusBasisAmount)}. The 15% group bonus has been credited to your wallet.`
        : 'Complete a group of 12 referrals with approved subscriptions and recorded initial fees to earn 15% of their combined subscription amount.';
      if (message) message.textContent = '';
    } catch (error) {
      if (message) message.textContent = `Referral details could not be loaded: ${error.message}`;
    } finally {
      if (refreshButton) refreshButton.disabled = false;
    }
  }

  async function copyReferralLink() {
    const input = document.getElementById('referralLink');
    const message = document.getElementById('referralMessage');
    if (!input || !input.value) return;
    try {
      await navigator.clipboard.writeText(input.value);
      if (message) message.textContent = 'Referral link copied.';
    } catch (error) {
      input.focus();
      input.select();
      if (message) message.textContent = 'Clipboard access is unavailable. The link is selected so you can copy it manually.';
    }
  }

  function updateSubscriptionPaymentAvailability() {
    const isActive = hasActiveSubscriptionLevel();
    const navItem = document.querySelector('.sidebar .nav-item.subscription-nav-link');
    const page = document.getElementById('subscription-payments');

    if (isActive && page?.classList.contains('active')) {
      const dashboardNavItem = document.querySelector('.sidebar .nav-item[onclick*="dashboard"]');
      window.showPage('dashboard', dashboardNavItem);
    }
    if (navItem) navItem.hidden = isActive;
    if (page) page.hidden = isActive;
  }

  function hasActiveSubscriptionLevel() {
    return currentUser?.subscriptionActive === true
      && Number.isInteger(currentUser.level)
      && currentUser.level >= 1
      && currentUser.level <= 30;
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
      [
        Number.isInteger(payment.requestedLevel)
          ? `Level ${payment.requestedLevel} (${payment.requestedPlan}) - ${currency(payment.amount)}`
          : payment.requestedPlan,
        new Date(payment.createdAt).toLocaleString(),
        payment.status
      ].forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      });
      rows.append(row);
    });
  }

  function updateSubscriptionNotices(payments = []) {
    updateSubscriptionPaymentAvailability();
    const notices = document.querySelectorAll('#subscriptionAccessDashboard, #subscriptionAccessTasks');
    if (!notices.length || !currentUser || currentUser.role === 'senior_admin') return;
    if (hasActiveSubscriptionLevel()) {
      notices.forEach((notice) => {
        notice.hidden = true;
        notice.replaceChildren();
      });
      return;
    }

    const latestPayment = payments[0];
    const message = currentUser.subscriptionActive
      ? 'Your account is marked active, but it does not have a valid assigned level. Daily tasks are available only to active members with an assigned subscription level. Please contact support.'
      : latestPayment?.status === 'pending'
        ? 'Daily tasks are available only to members with an active subscription and assigned level. Your payment is awaiting admin verification.'
        : latestPayment?.status === 'rejected'
          ? 'Daily tasks are available only to members with an active subscription and assigned level. Your last payment was not approved; submit a valid receipt for review.'
          : 'Daily tasks are available only to members with an active subscription and assigned level. Choose a subscription level and submit its payment receipt for admin verification.';

    notices.forEach((notice) => {
      notice.hidden = false;
      notice.replaceChildren(document.createTextNode(message));
      if (!currentUser.subscriptionActive) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-primary u-margin-left-10px';
        button.textContent = 'Choose a subscription level';
        button.addEventListener('click', () => {
          const navItem = document.querySelector('.sidebar .nav-item.subscription-nav-link');
          window.showPage('subscription-payments', navItem);
        });
        notice.append(document.createTextNode(' '), button);
      }
    });
  }

  async function submitSubscriptionPayment() {
    const requestedLevel = Number(document.getElementById('subscriptionLevel').value);
    const paymentReference = document.getElementById('paymentReference').value.trim();
    const file = document.getElementById('paymentProof').files[0];
    if (!Number.isInteger(requestedLevel) || requestedLevel < 1 || requestedLevel > 30) {
      showSubscriptionPaymentMessage('Choose a subscription level.', 'danger');
      return;
    }
    if (!paymentReference || !file || !selectedPaymentProof) {
      showSubscriptionPaymentMessage('Enter the payment reference and select a valid receipt image.', 'danger');
      return;
    }
    const button = document.getElementById('submitSubscriptionPayment');
    button.disabled = true;
    try {
      const result = await apiRequest('/api/subscription/payments', {
        method: 'POST',
        body: JSON.stringify({ requestedLevel, paymentReference, proof: selectedPaymentProof })
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

  document.getElementById('openRegisterLink')?.addEventListener('click', () => window.openRegister());
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
    const plan = user.plan || 'Basic';
    if (profilePlan) {
      profilePlan.textContent = user.level ? `${plan} · Level ${user.level}` : plan;
      profilePlan.className = `plan-badge plan-${plan.toLowerCase()}`;
    }
    const dashboardPlan = document.getElementById('dashboardPlanBadge');
    if (dashboardPlan) {
      dashboardPlan.hidden = false;
      dashboardPlan.textContent = user.level ? `${plan} · Level ${user.level}` : plan;
      dashboardPlan.className = `current-plan-banner plan-${plan.toLowerCase()}`;
    }
    document.querySelectorAll('#levelBenefitsRows tr[data-level]').forEach((row) => {
      row.classList.toggle('current-level', Number(row.dataset.level) === user.level);
    });
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
    currentWithdrawalSchedule = data.withdrawalSchedule;
    removeUnavailableFeatures();
    updateDashboardLinks(data.user.role);
    setupSubscriptionPayments();
    setupLevelBenefits();
    setupReferralDashboard();
    window.balance = data.stats.balance;
    window.updateBalance();
    window.updateLevelChallenge();
    updateAccountHeader(data.user);
    updateWithdrawalSchedule(data.user, data.withdrawalSchedule);
    updateReferralGroupBonusNotice(data.user);

    const balance = document.getElementById('balance');
    const totalEarnings = document.getElementById('totalEarnings');
    const tasksCompleted = document.getElementById('tasksCompleted');
    if (balance) balance.textContent = currency(data.stats.balance);
    if (totalEarnings) totalEarnings.textContent = currency(data.stats.totalEarnings);
    if (tasksCompleted) tasksCompleted.textContent = String(data.stats.tasksCompleted);

    const totalWithdrawals = document.getElementById('walletTotalWithdrawals');
    const pendingWithdrawals = document.getElementById('walletPendingWithdrawals');
    if (totalWithdrawals) totalWithdrawals.textContent = currency(data.user.wallet.totalWithdrawals);
    if (pendingWithdrawals) pendingWithdrawals.textContent = currency(data.user.wallet.pendingWithdrawals);

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
        let answerInput = null;
        if (task.questionTask) {
          const answerLabel = document.createElement('label');
          answerLabel.className = 'task-answer';
          answerLabel.textContent = 'Your answer';
          answerInput = document.createElement('input');
          answerInput.type = 'text';
          answerInput.autocomplete = 'off';
          answerInput.disabled = !task.available;
          answerLabel.append(answerInput);
          details.append(answerLabel);
        }
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
        button.textContent = task.available
          ? (task.questionTask ? 'Submit answer' : 'Complete')
          : 'Completed today';
        button.disabled = !task.available;
        button.onclick = () => window.completeTask(button, task.reward, task.title, task.id, answerInput?.value);
        action.append(reward, button);
        item.append(info, action);
        list.append(item);
      });
    });

    renderTransactions(data.user.transactions);
  }

  function updateWithdrawalSchedule(user, schedule) {
    const scheduleText = formatWithdrawalSchedule(schedule);
    const walletNotice = document.getElementById('walletWithdrawalSchedule');
    const modalNotice = document.getElementById('withdrawScheduleNotice');
    if (walletNotice) walletNotice.textContent = scheduleText;
    if (modalNotice) {
      modalNotice.textContent = `Withdrawal amount: KES 500. ${user.plan || 'Basic'} withdrawals: ${scheduleText}`;
    }
  }

  function updateReferralGroupBonusNotice(user) {
    const notice = document.getElementById('referralGroupBonusNotice');
    if (!notice) return;
    if (!user.referralGroupBonusAwarded) {
      notice.hidden = true;
      notice.replaceChildren();
      return;
    }

    const title = document.createElement('strong');
    title.textContent = 'Congratulations on completing your first referral group!';
    const details = document.createElement('p');
    details.textContent = `Your 12 referrals’ initial subscriptions totaled ${currency(user.referralGroupBonusBasisAmount)}. Your 15% group bonus of ${currency(user.referralGroupBonusAmount)} has been credited to your wallet.`;
    notice.replaceChildren(title, details);
    notice.hidden = false;

    if (!user.referralGroupBonusNotificationRead) {
      const popupKey = `taskearnGroupBonusShown:${user.id}`;
      if (!localStorage.getItem(popupKey)) {
        localStorage.setItem(popupKey, 'true');
        window.alert(`Congratulations! You formed your first referral group. Their initial subscription fees totaled ${currency(user.referralGroupBonusBasisAmount)}, and ${currency(user.referralGroupBonusAmount)} (15%) has been added to your wallet.`);
      }
      void apiRequest('/api/referrals/group-bonus/acknowledge', { method: 'POST' })
        .catch((error) => console.error('Could not acknowledge referral group bonus notification:', error));
    }
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
    const button = document.getElementById('loginButton');
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
        button.textContent = 'Sign In';
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
        body: JSON.stringify({
          name,
          email,
          password,
          referralCode: new URLSearchParams(location.search).get('ref') || ''
        })
      });
      localStorage.setItem(tokenKey, result.token);
      try {
        await loadDashboard();
      } catch (error) {
        localStorage.removeItem(tokenKey);
        closeModal('registerModal');
        showLoginMessage(
          `Your account was created, but we could not start your session. Please sign in with your new account. ${error.message}`,
          'info'
        );
        return;
      }
      closeModal('registerModal');
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

  window.completeTask = async function completeTask(button, amount, name, taskId, answer) {
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
        body: JSON.stringify({ answer: answer ?? '' })
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
      return alert(`Withdrawals for your ${currentUser?.plan || 'Basic'} plan are available ${formatWithdrawalSchedule(currentWithdrawalSchedule)}`);
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
      currentWithdrawalSchedule = null;
      referralSummaryRequest += 1;
      window.showPage('dashboard', document.querySelector('.sidebar .nav-item[onclick*="dashboard"]'));
      document.getElementById('referrals')?.remove();
      document.querySelector('.referral-nav-link')?.remove();
      document.getElementById('level-benefits')?.remove();
      document.querySelector('.level-benefits-nav-link')?.remove();
      updateDashboardLinks('member');
      setVisibleState(false);
    }
  };

  const emailInput = document.getElementById('loginEmail');
  const emailLabel = document.querySelector('label[for="loginEmail"]');
  if (emailInput) {
    emailInput.type = 'email';
    emailInput.placeholder = 'you@example.com';
    emailInput.value = localStorage.getItem('taskearnRememberedEmail') || '';
  }
  if (emailLabel) emailLabel.textContent = 'Email Address';
  const rememberLogin = document.getElementById('rememberLogin');
  if (rememberLogin) rememberLogin.checked = Boolean(localStorage.getItem('taskearnRememberedEmail'));

  document.getElementById('loginForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const remember = document.getElementById('rememberLogin')?.checked;
    if (remember) {
      localStorage.setItem('taskearnRememberedEmail', document.getElementById('loginEmail').value.trim());
    } else {
      localStorage.removeItem('taskearnRememberedEmail');
    }
    window.login();
  });

  document.getElementById('toggleLoginPassword')?.addEventListener('click', (event) => {
    const password = document.getElementById('loginPassword');
    if (!password) return;
    const isHidden = password.type === 'password';
    password.type = isHidden ? 'text' : 'password';
    event.currentTarget.textContent = isHidden ? 'Hide' : 'Show';
    event.currentTarget.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
  });

  document.getElementById('forgotPassword')?.addEventListener('click', () => {
    showLoginMessage('Password reset is not available yet. Please contact an administrator for assistance.', 'info');
  });

  async function restoreSession() {
    const token = localStorage.getItem(tokenKey);
    if (!token) return;
    try {
      const { user } = await apiRequest('/api/me');
      if (localStorage.getItem(tokenKey) !== token) return;
      if (user.role === 'admin') {
        window.location.replace('/admin');
        return;
      }
      await loadDashboard();
      if (localStorage.getItem(tokenKey) !== token) return;
      setVisibleState(true);
    } catch (error) {
      if (localStorage.getItem(tokenKey) !== token) return;
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
