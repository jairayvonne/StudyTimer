// --- STATE & STORAGE ---
let accounts = JSON.parse(localStorage.getItem('tl_accounts')) || [];
let user = JSON.parse(localStorage.getItem('tl_user')) || null;
let schedules = JSON.parse(localStorage.getItem('tl_schedules')) || [];
let historyLogs = JSON.parse(localStorage.getItem('tl_history')) || [];

// Timer State: Study + Break every 25 minutes (Break: 5-15 mins, default 5m)
const STUDY_BLOCK_MINUTES = 25;
let totalStudyMinutes = 25;
let breakMinutes = 5;
let currentMode = 'study'; // 'study' or 'break'
let remainingStudySeconds = totalStudyMinutes * 60;
let studySecondsSinceBreak = 0;
let timeLeft = totalStudyMinutes * 60;
let timerInterval = null;
let isRunning = false;
let isPaused = false;
let dismissedNotifThisSession = false;

// Continuous Alarm State
let alarmLoopInterval = null;
let isAlarmRinging = false;
let pendingAlarmAction = null;

// --- DOM ELEMENTS ---
const splashScreen = document.getElementById('splash-screen');
const loginScreen = document.getElementById('login-screen');
const mainApp = document.getElementById('main-app');

const authSubtitle = document.getElementById('auth-subtitle');
const authFeedback = document.getElementById('auth-feedback');

const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const forgotForm = document.getElementById('forgot-form');

const notifModal = document.getElementById('notif-modal');
const notifModalStatus = document.getElementById('notif-modal-status');
const modalEnableNotifBtn = document.getElementById('modal-enable-notif-btn');
const modalLaterNotifBtn = document.getElementById('modal-later-notif-btn');

const subjectInput = document.getElementById('subject-input');
const customStudyInput = document.getElementById('custom-study-mins');
const customBreakInput = document.getElementById('custom-break-mins');
const timerNotice = document.getElementById('timer-notice');
const alarmAlertBox = document.getElementById('alarm-alert-box');
const alarmAlertText = document.getElementById('alarm-alert-text');
const stopAlarmBtn = document.getElementById('stop-alarm-btn');
const timerCircle = document.getElementById('timer-circle');
const timerModeBadge = document.getElementById('timer-mode-badge');
const timerDisplay = document.getElementById('timer-display');
const timerSubinfo = document.getElementById('timer-subinfo');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const resetBtn = document.getElementById('reset-btn');

// 1. SPLASH SCREEN LOADING LOGIC
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (splashScreen) {
      splashScreen.classList.remove('active');
    }

    if (user && (user.username || user.fullName)) {
      loadMainApp();
    } else if (loginScreen) {
      loginScreen.classList.add('active');
      switchAuthMode('login');
    }
  }, 2200);
});

// 2. AUTH MODE SWITCHER
function showFeedback(message, type = 'error') {
  if (!authFeedback) return;
  authFeedback.textContent = message;
  authFeedback.className = `auth-feedback show ${type}`;
}

function clearFeedback() {
  if (!authFeedback) return;
  authFeedback.textContent = '';
  authFeedback.className = 'auth-feedback';
}

function switchAuthMode(mode) {
  clearFeedback();
  if (loginForm) loginForm.classList.remove('active');
  if (signupForm) signupForm.classList.remove('active');
  if (forgotForm) forgotForm.classList.remove('active');

  if (mode === 'signup') {
    if (signupForm) signupForm.classList.add('active');
    if (authSubtitle) authSubtitle.textContent = 'Create a student account to get started.';
  } else if (mode === 'forgot') {
    if (forgotForm) forgotForm.classList.add('active');
    if (authSubtitle) authSubtitle.textContent = 'Reset your password using your email or username.';
  } else {
    if (loginForm) loginForm.classList.add('active');
    if (authSubtitle) authSubtitle.textContent = 'Log in to start.';
  }
}

document.getElementById('show-signup-btn')?.addEventListener('click', () => switchAuthMode('signup'));
document.getElementById('show-forgot-btn')?.addEventListener('click', () => switchAuthMode('forgot'));
document.getElementById('back-to-login-from-signup')?.addEventListener('click', () => switchAuthMode('login'));
document.getElementById('back-to-login-from-forgot')?.addEventListener('click', () => switchAuthMode('login'));

// 3. NOTIFICATION MODAL & ENTRY INTO MAIN APP
function showNotifModalStatus(msg) {
  if (!notifModalStatus) return;
  notifModalStatus.textContent = msg;
  notifModalStatus.classList.add('show');
}

function openNotifModalIfNeeded() {
  if (!notifModal || dismissedNotifThisSession) return;
  if (!('Notification' in window)) return;

  if (Notification.permission === 'default') {
    if (notifModalStatus) {
      notifModalStatus.textContent = '';
      notifModalStatus.classList.remove('show');
    }
    notifModal.classList.add('active');
  }
}

function closeNotifModal() {
  if (notifModal) {
    notifModal.classList.remove('active');
  }
}

modalEnableNotifBtn?.addEventListener('click', async () => {
  if (!('Notification' in window)) {
    showNotifModalStatus('Notifications are not supported in this browser.');
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      showNotifModalStatus('Notifications enabled!');
      new Notification('Time Lock: Study Timer', {
        body: 'Study notifications are now active.'
      });
      setTimeout(() => {
        closeNotifModal();
      }, 900);
    } else if (permission === 'denied') {
      showNotifModalStatus('Notifications are blocked in browser settings.');
    } else {
      showNotifModalStatus('Permission was not granted yet.');
    }
  } catch (err) {
    console.log('Notification request error:', err);
    showNotifModalStatus('Unable to open notification prompt.');
  }
});

modalLaterNotifBtn?.addEventListener('click', () => {
  dismissedNotifThisSession = true;
  closeNotifModal();
});

function enterMainAppWithAccount(activeAccount) {
  dismissedNotifThisSession = false;
  user = {
    fullName: activeAccount.fullName,
    username: activeAccount.username,
    email: activeAccount.email
  };
  localStorage.setItem('tl_user', JSON.stringify(user));

  if (loginScreen) {
    loginScreen.classList.remove('active');
  }
  loadMainApp();
}

// 4. LOGIN SUBMIT
if (loginForm) {
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearFeedback();

    const identifier = document.getElementById('login-identifier').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;

    const matchedAccount = accounts.find(
      acc =>
        (acc.email.toLowerCase() === identifier || acc.username.toLowerCase() === identifier) &&
        acc.password === password
    );

    if (!matchedAccount) {
      showFeedback('Invalid email/username or password. Create an account if you are new.', 'error');
      return;
    }

    loginForm.reset();
    enterMainAppWithAccount(matchedAccount);
  });
}

// 5. CREATE ACCOUNT SUBMIT
if (signupForm) {
  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearFeedback();

    const fullName = document.getElementById('signup-fullname').value.trim();
    const username = document.getElementById('signup-username').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm-password').value;

    if (!fullName || !username || !email || !password) {
      showFeedback('Please fill out all required fields.', 'error');
      return;
    }

    if (password.length < 4) {
      showFeedback('Password must be at least 4 characters.', 'error');
      return;
    }

    if (password !== confirmPassword) {
      showFeedback('Passwords do not match.', 'error');
      return;
    }

    const alreadyExists = accounts.some(
      acc =>
        acc.email.toLowerCase() === email.toLowerCase() ||
        acc.username.toLowerCase() === username.toLowerCase()
    );
    if (alreadyExists) {
      showFeedback('An account with that email or username already exists.', 'error');
      return;
    }

    const newAccount = { fullName, username, email, password };
    accounts.push(newAccount);
    localStorage.setItem('tl_accounts', JSON.stringify(accounts));

    signupForm.reset();
    switchAuthMode('login');

    const loginIdentifierInput = document.getElementById('login-identifier');
    if (loginIdentifierInput) {
      loginIdentifierInput.value = username || email;
    }

    showFeedback('Account created successfully! You can now log in.', 'success');
  });
}

// 6. FORGOT PASSWORD SUBMIT
if (forgotForm) {
  forgotForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearFeedback();

    const identifier = document.getElementById('forgot-identifier').value.trim().toLowerCase();
    const newPassword = document.getElementById('reset-new-password').value;
    const confirmNewPassword = document.getElementById('reset-confirm-password').value;

    const accountIndex = accounts.findIndex(
      acc =>
        acc.email.toLowerCase() === identifier ||
        acc.username.toLowerCase() === identifier
    );
    if (accountIndex === -1) {
      showFeedback('No account found with that email or username.', 'error');
      return;
    }

    if (newPassword.length < 4) {
      showFeedback('New password must be at least 4 characters.', 'error');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      showFeedback('New passwords do not match.', 'error');
      return;
    }

    accounts[accountIndex].password = newPassword;
    localStorage.setItem('tl_accounts', JSON.stringify(accounts));

    forgotForm.reset();
    switchAuthMode('login');
    showFeedback('Password reset successful! You can now log in with your new password.', 'success');
  });
}

function loadMainApp() {
  if (mainApp) {
    mainApp.classList.add('active');
  }
  const displayUsername = document.getElementById('display-username');
  const settingsFullname = document.getElementById('settings-fullname');
  const settingsUsername = document.getElementById('settings-username');
  const settingsEmail = document.getElementById('settings-email');

  const label = user.username || user.fullName || 'Student';
  if (displayUsername) displayUsername.textContent = label;
  if (settingsFullname) settingsFullname.textContent = user.fullName || '-';
  if (settingsUsername) settingsUsername.textContent = user.username || '-';
  if (settingsEmail) settingsEmail.textContent = user.email || '-';

  syncTimerFromInputs();
  updateTimerDisplay();
  renderSchedules();
  renderHistory();
  openNotifModalIfNeeded();
}

// 7. TAB NAVIGATION
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));

    btn.classList.add('active');
    const targetTab = document.getElementById(btn.dataset.target);
    if (targetTab) {
      targetTab.classList.add('active');
    }
  });
});

// 8. CONTINUOUS ALARM SOUND GENERATOR (Stops only when Stop Alarm is pressed)
function playSingleAlarmBurst() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  const audioCtx = new AudioContextClass();
  const beeps = [0, 0.25, 0.5, 0.75];

  beeps.forEach(delay => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime + delay);
    gain.gain.setValueAtTime(0.55, audioCtx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + 0.22);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime + delay);
    osc.stop(audioCtx.currentTime + delay + 0.22);
  });
}

function triggerContinuousAlarm(message = '🔔 Time is up! Tap Stop Alarm', afterStopCallback = null) {
  isAlarmRinging = true;
  pendingAlarmAction = afterStopCallback;

  if (alarmAlertText) {
    alarmAlertText.textContent = message;
  }
  if (alarmAlertBox) {
    alarmAlertBox.classList.add('active');
  }

  playSingleAlarmBurst();

  if (alarmLoopInterval) {
    clearInterval(alarmLoopInterval);
  }

  alarmLoopInterval = setInterval(() => {
    if (isAlarmRinging) {
      playSingleAlarmBurst();
    }
  }, 1500);
}

function stopContinuousAlarm(runPendingAction = true) {
  isAlarmRinging = false;
  if (alarmLoopInterval) {
    clearInterval(alarmLoopInterval);
    alarmLoopInterval = null;
  }
  if (alarmAlertBox) {
    alarmAlertBox.classList.remove('active');
  }

  const callbackToRun = pendingAlarmAction;
  pendingAlarmAction = null;

  if (runPendingAction && typeof callbackToRun === 'function') {
    callbackToRun();
  }
}

stopAlarmBtn?.addEventListener('click', () => {
  stopContinuousAlarm(true);
});

// 9. STUDY TIMER LOGIC (Required subject + Custom study minutes + 5-15m break every 25m + Pause/Resume + Continuous Alarm)
function showTimerNotice(msg, isInfo = false) {
  if (!timerNotice) return;
  timerNotice.textContent = msg;
  timerNotice.className = isInfo ? 'timer-notice show info' : 'timer-notice show';
}

function clearTimerNotice() {
  if (!timerNotice) return;
  timerNotice.textContent = '';
  timerNotice.className = 'timer-notice';
}

function getValidatedBreakMinutes() {
  const parsedBreak = parseInt(customBreakInput?.value, 10);
  if (!Number.isFinite(parsedBreak)) return 5;
  return Math.min(15, Math.max(5, parsedBreak));
}

function setPauseButtonState(state) {
  if (!pauseBtn) return;
  if (state === 'running') {
    pauseBtn.disabled = false;
    pauseBtn.textContent = 'Pause';
    pauseBtn.classList.remove('resuming');
  } else if (state === 'paused') {
    pauseBtn.disabled = false;
    pauseBtn.textContent = 'Resume';
    pauseBtn.classList.add('resuming');
  } else {
    pauseBtn.disabled = true;
    pauseBtn.textContent = 'Pause';
    pauseBtn.classList.remove('resuming');
  }
}

function syncTimerFromInputs() {
  if (isRunning || isPaused) return;
  const parsed = parseInt(customStudyInput?.value, 10);
  totalStudyMinutes = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 300) : 25;
  if (customStudyInput && customStudyInput.value !== '') {
    customStudyInput.value = totalStudyMinutes;
  }

  breakMinutes = getValidatedBreakMinutes();

  currentMode = 'study';
  remainingStudySeconds = totalStudyMinutes * 60;
  studySecondsSinceBreak = 0;

  if (remainingStudySeconds > STUDY_BLOCK_MINUTES * 60) {
    timeLeft = STUDY_BLOCK_MINUTES * 60;
  } else {
    timeLeft = remainingStudySeconds;
  }

  updateTimerDisplay();
}

function updateTimerDisplay() {
  if (!timerDisplay) return;
  const mins = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const secs = (timeLeft % 60).toString().padStart(2, '0');
  timerDisplay.textContent = `${mins}:${secs}`;

  if (timerModeBadge) {
    timerModeBadge.textContent = currentMode === 'break' ? 'BREAK' : 'STUDY';
  }
  if (timerCircle) {
    timerCircle.classList.toggle('break-mode', currentMode === 'break');
  }
  if (timerSubinfo) {
    const remMins = Math.ceil(remainingStudySeconds / 60);
    timerSubinfo.textContent =
      currentMode === 'break'
        ? `${breakMinutes}m Break • ${remMins}m study left`
        : `${breakMinutes}m break every 25m • ${remMins}m total left`;
  }
}

customStudyInput?.addEventListener('input', () => {
  if (isRunning || isPaused) return;
  const val = parseInt(customStudyInput.value, 10);
  if (Number.isFinite(val) && val > 0) {
    totalStudyMinutes = Math.min(val, 300);
    currentMode = 'study';
    remainingStudySeconds = totalStudyMinutes * 60;
    studySecondsSinceBreak = 0;
    timeLeft = Math.min(remainingStudySeconds, STUDY_BLOCK_MINUTES * 60);
    updateTimerDisplay();
  }
});

customBreakInput?.addEventListener('input', () => {
  const val = parseInt(customBreakInput.value, 10);
  if (!Number.isFinite(val)) return;

  if (val < 5 || val > 15) {
    showTimerNotice('Break minutes must be between 5 and 15 minutes.', false);
  } else {
    clearTimerNotice();
  }

  breakMinutes = Math.min(15, Math.max(5, val));
  if (currentMode === 'break' && !isRunning) {
    timeLeft = breakMinutes * 60;
  }
  updateTimerDisplay();
});

customBreakInput?.addEventListener('change', () => {
  const clamped = getValidatedBreakMinutes();
  if (customBreakInput) customBreakInput.value = clamped;
  breakMinutes = clamped;
  if (currentMode === 'break' && !isRunning) {
    timeLeft = breakMinutes * 60;
  }
  updateTimerDisplay();
});

subjectInput?.addEventListener('input', () => {
  if (subjectInput.value.trim()) {
    clearTimerNotice();
  }
});

function startCountdownLoop(subject) {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;

    if (currentMode === 'study') {
      remainingStudySeconds = Math.max(0, remainingStudySeconds - 1);
      studySecondsSinceBreak++;
    }

    updateTimerDisplay();

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      isRunning = false;

      if (currentMode === 'study') {
        if (remainingStudySeconds <= 0) {
          sendNotification('Time Lock: Study Complete!', `Great job finishing ${totalStudyMinutes} mins on ${subject}!`);
          saveHistory(subject, totalStudyMinutes);

          triggerContinuousAlarm(
            `🔔 Study done (${totalStudyMinutes}m ${subject})! Tap Stop Alarm`,
            () => {
              isPaused = false;
              if (startBtn) startBtn.disabled = false;
              setPauseButtonState('idle');
              if (subjectInput) subjectInput.disabled = false;
              if (customStudyInput) customStudyInput.disabled = false;
              if (customBreakInput) customBreakInput.disabled = false;
              showTimerNotice(`Completed ${totalStudyMinutes} mins of ${subject}!`, true);
              syncTimerFromInputs();
            }
          );
          return;
        }

        // Hit 25-minute study block -> ring alarm until stopped, then start Break
        sendNotification('Time Lock: Break Time!', `25m study done! Take a ${breakMinutes}-minute break.`);
        triggerContinuousAlarm(
          `🔔 25m study done! Tap Stop Alarm for ${breakMinutes}m break`,
          () => {
            currentMode = 'break';
            studySecondsSinceBreak = 0;
            timeLeft = breakMinutes * 60;
            updateTimerDisplay();
            showTimerNotice(`Break time (${breakMinutes} mins) started!`, true);
            startOrResumeTimer();
          }
        );
      } else {
        // Break finished -> ring alarm until stopped, then return to Study
        sendNotification('Time Lock: Back to Study!', `Break is over. Time to study ${subject}!`);
        triggerContinuousAlarm(
          `🔔 Break over! Tap Stop Alarm to study ${subject}`,
          () => {
            currentMode = 'study';
            studySecondsSinceBreak = 0;
            timeLeft = Math.min(remainingStudySeconds, STUDY_BLOCK_MINUTES * 60);
            updateTimerDisplay();
            showTimerNotice(`Break over! Back to studying ${subject}.`, true);
            startOrResumeTimer();
          }
        );
      }
    }
  }, 1000);
}

function startOrResumeTimer() {
  if (isRunning || isAlarmRinging) return;

  const subject = subjectInput ? subjectInput.value.trim() : '';
  if (!subject) {
    showTimerNotice('Please enter what you are studying before starting the timer.');
    subjectInput?.focus();
    return;
  }

  const clampedBreak = getValidatedBreakMinutes();
  if (customBreakInput) customBreakInput.value = clampedBreak;
  breakMinutes = clampedBreak;

  clearTimerNotice();

  if (!isPaused && currentMode === 'study' && studySecondsSinceBreak === 0 && remainingStudySeconds === totalStudyMinutes * 60) {
    const parsed = parseInt(customStudyInput?.value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      totalStudyMinutes = Math.min(parsed, 300);
      remainingStudySeconds = totalStudyMinutes * 60;
      timeLeft = Math.min(remainingStudySeconds, STUDY_BLOCK_MINUTES * 60);
    }
  }

  isRunning = true;
  isPaused = false;
  if (startBtn) startBtn.disabled = true;
  setPauseButtonState('running');
  if (subjectInput) subjectInput.disabled = true;
  if (customStudyInput) customStudyInput.disabled = true;
  if (customBreakInput) customBreakInput.disabled = true;

  startCountdownLoop(subject);
}

if (startBtn) {
  startBtn.addEventListener('click', startOrResumeTimer);
}

if (pauseBtn) {
  pauseBtn.addEventListener('click', () => {
    if (isAlarmRinging) return;

    if (isRunning) {
      clearInterval(timerInterval);
      isRunning = false;
      isPaused = true;
      if (startBtn) startBtn.disabled = false;
      setPauseButtonState('paused');
      if (subjectInput) subjectInput.disabled = false;
      if (customStudyInput) customStudyInput.disabled = false;
      if (customBreakInput) customBreakInput.disabled = false;
    } else if (isPaused) {
      startOrResumeTimer();
    }
  });
}

if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    stopContinuousAlarm(false);
    clearInterval(timerInterval);
    isRunning = false;
    isPaused = false;
    if (startBtn) startBtn.disabled = false;
    setPauseButtonState('idle');
    if (subjectInput) subjectInput.disabled = false;
    if (customStudyInput) customStudyInput.disabled = false;
    if (customBreakInput) customBreakInput.disabled = false;
    clearTimerNotice();
    syncTimerFromInputs();
  });
}

function sendNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

// 10. SCHEDULE MANAGER
const scheduleForm = document.getElementById('schedule-form');
if (scheduleForm) {
  scheduleForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const subject = document.getElementById('sched-subject').value;
    const date = document.getElementById('sched-date').value;
    const time = document.getElementById('sched-time').value;

    schedules.push({ id: Date.now(), subject, date, time });
    localStorage.setItem('tl_schedules', JSON.stringify(schedules));
    e.target.reset();
    renderSchedules();
  });
}

function renderSchedules() {
  const list = document.getElementById('schedule-list');
  if (!list) return;
  list.innerHTML = schedules.length
    ? ''
    : '<p style="text-align:center;color:#c4b5fd;font-size:13.5px;">No schedules yet.</p>';

  schedules.forEach(item => {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `
      <div>
        <h4>${item.subject}</h4>
        <p>📅 ${item.date} at ⏰ ${item.time}</p>
      </div>
      <button type="button" class="text-btn" onclick="deleteSchedule(${item.id})">Delete</button>
    `;
    list.appendChild(div);
  });
}

window.deleteSchedule = (id) => {
  schedules = schedules.filter(s => s.id !== id);
  localStorage.setItem('tl_schedules', JSON.stringify(schedules));
  renderSchedules();
};

// 11. STUDY HISTORY
function saveHistory(subject, minutes) {
  const dateStr =
    new Date().toLocaleDateString() +
    ' ' +
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  historyLogs.unshift({ subject, minutes, date: dateStr });
  localStorage.setItem('tl_history', JSON.stringify(historyLogs));
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;
  list.innerHTML = historyLogs.length
    ? ''
    : '<p style="text-align:center;color:#c4b5fd;font-size:13.5px;">No completed sessions yet.</p>';

  historyLogs.forEach(log => {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `
      <div>
        <h4>${log.subject} (${log.minutes} mins)</h4>
        <p>Completed on ${log.date}</p>
      </div>
      <span>✅</span>
    `;
    list.appendChild(div);
  });
}

const clearHistoryBtn = document.getElementById('clear-history-btn');
if (clearHistoryBtn) {
  clearHistoryBtn.addEventListener('click', () => {
    historyLogs = [];
    localStorage.setItem('tl_history', JSON.stringify(historyLogs));
    renderHistory();
  });
}

// 12. SETTINGS & LOGOUT
const testSoundBtn = document.getElementById('test-sound-btn');
if (testSoundBtn) {
  testSoundBtn.addEventListener('click', () => {
    if (isAlarmRinging) {
      stopContinuousAlarm(false);
      testSoundBtn.textContent = 'Play';
    } else {
      testSoundBtn.textContent = 'Stop';
      triggerContinuousAlarm('🔔 Testing alarm sound! Tap Stop Alarm', () => {
        testSoundBtn.textContent = 'Play';
      });
    }
  });
}

const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    stopContinuousAlarm(false);
    localStorage.removeItem('tl_user');
    user = null;
    clearInterval(timerInterval);
    isRunning = false;
    isPaused = false;
    setPauseButtonState('idle');
    if (mainApp) mainApp.classList.remove('active');
    if (loginScreen) {
      loginScreen.classList.add('active');
      switchAuthMode('login');
    }
  });
}