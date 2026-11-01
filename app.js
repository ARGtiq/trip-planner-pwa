const STORAGE_KEY = 'trip-planner-v1';

let state = {
  trips: [],
  currentTripId: null,
  currentDayIndex: null,
  view: 'home',
  timelineMode: false
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state.trips = JSON.parse(raw);
  } catch (e) {}
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.trips));
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function getDaysBetween(start, end) {
  const days = [];
  const s = new Date(start);
  const e = new Date(end);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    days.push({
      date: d.toISOString().slice(0, 10),
      places: []
    });
  }
  return days;
}

function render() {
  const app = document.getElementById('app');
  if (state.view === 'home') app.innerHTML = renderHome();
  else if (state.view === 'trip') app.innerHTML = renderTrip();
  else if (state.view === 'day') app.innerHTML = renderDay();
  bindEvents();
}

function renderHome() {
  const trips = state.trips.map(t => `
    <div class="card trip-card" data-id="${t.id}">
      <div style="height:160px;background:linear-gradient(135deg,#0d9488,#14b8a6);display:flex;align-items:center;justify-content:center;font-size:3rem;">✈️</div>
      <div class="body">
        <h2>${t.name}</h2>
        <div class="meta">📅 ${formatDate(t.startDate)} – ${formatDate(t.endDate)}</div>
        <button class="btn secondary" style="margin-top:12px;" data-action="open" data-id="${t.id}">Открыть</button>
      </div>
    </div>
  `).join('');

  return `
    <header>
      <div>
        <h1>Trip Planner</h1>
        <p>Планируй быстро. Без лишнего.</p>
      </div>
    </header>
    <div class="screen">
      ${trips || '<div class="empty"><h2>Пока пусто</h2><p>Создай первую поездку — это займёт 10 секунд.</p></div>'}
      <button class="btn" data-action="new">+ Новая поездка</button>
    </div>
  `;
}

function renderTrip() {
  const trip = state.trips.find(t => t.id === state.currentTripId);
  if (!trip) return renderHome();

  const days = trip.days.map((day, i) => `
    <div class="card day-card" data-index="${i}">
      <h3>День ${i + 1}</h3>
      <div class="date">${formatDate(day.date)}</div>
      ${day.places.length
        ? day.places.slice(0, 3).map(p => `
            <div class="place-item">
              <div class="place-icon">📍</div>
              <div class="info">
                <div class="name">${p.name}</div>
                <div class="sub">${p.timeBlock === 'morning' ? 'Утро' : p.timeBlock === 'afternoon' ? 'День' : 'Вечер'}</div>
              </div>
            </div>
          `).join('')
        : '<div style="color:#64748b;padding:8px 0;">Пока пусто</div>'
      }
      <button class="btn secondary" data-action="open-day" data-index="${i}" style="margin-top:8px;">Открыть день</button>
    </div>
  `).join('');

  return `
    <header>
      <button class="btn ghost" data-action="back" style="width:auto;padding:8px 12px;">←</button>
      <div style="text-align:center;flex:1;">
        <h1 style="font-size:1.4rem;">${trip.name}</h1>
        <p>${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}</p>
      </div>
      <div style="width:60px;"></div>
    </header>
    <div class="screen">
      ${days}
    </div>
  `;
}

function renderDay() {
  const trip = state.trips.find(t => t.id === state.currentTripId);
  const day = trip?.days[state.currentDayIndex];
  if (!day) return renderTrip();

  const blocks = ['morning', 'afternoon', 'evening'];
  const labels = { morning: 'Утро', afternoon: 'День', evening: 'Вечер' };

  const blockHtml = blocks.map(block => {
    const places = day.places.filter(p => p.timeBlock === block);
    return `
      <div class="block ${state.timelineMode ? 'timeline' : ''}">
        <div class="block-header">
          <span>${labels[block]}</span>
          <span style="font-weight:400;color:#64748b;font-size:0.85rem;">${places.length} мест</span>
        </div>
        <div class="block-body">
          ${places.map(p => `
            <div class="place-item">
              <div class="place-icon">📍</div>
              <div class="info">
                <div class="name">${p.name}</div>
                ${p.notes ? `<div class="sub">${p.notes}</div>` : ''}
              </div>
              <button data-action="delete-place" data-id="${p.id}" style="background:none;border:none;color:#94a3b8;font-size:1.2rem;">×</button>
            </div>
          `).join('')}
          <div class="add-place" data-action="add-place" data-block="${block}">+ Добавить место</div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <header>
      <button class="btn ghost" data-action="back-trip" style="width:auto;padding:8px 12px;">←</button>
      <div style="text-align:center;flex:1;">
        <h1 style="font-size:1.3rem;">День ${state.currentDayIndex + 1}</h1>
        <p>${formatDate(day.date)}</p>
      </div>
      <label class="toggle">
        <input type="checkbox" id="timeline-toggle" ${state.timelineMode ? 'checked' : ''} />
        Таймлайн
      </label>
    </header>
    <div class="screen">
      ${blockHtml}
    </div>
  `;
}

function bindEvents() {
  document.querySelectorAll('[data-action]').forEach(el => {
    el.onclick = (e) => {
      const action = el.dataset.action;
      if (action === 'new') openNewTripModal();
      if (action === 'open') {
        state.currentTripId = el.dataset.id;
        state.view = 'trip';
        render();
      }
      if (action === 'open-day') {
        state.currentDayIndex = +el.dataset.index;
        state.view = 'day';
        render();
      }
      if (action === 'back') { state.view = 'home'; render(); }
      if (action === 'back-trip') { state.view = 'trip'; render(); }
      if (action === 'add-place') openAddPlaceModal(el.dataset.block);
      if (action === 'delete-place') {
        const trip = state.trips.find(t => t.id === state.currentTripId);
        const day = trip.days[state.currentDayIndex];
        day.places = day.places.filter(p => p.id !== el.dataset.id);
        save();
        render();
      }
    };
  });

  const toggle = document.getElementById('timeline-toggle');
  if (toggle) {
    toggle.onchange = () => {
      state.timelineMode = toggle.checked;
      render();
    };
  }
}

function openNewTripModal() {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <h3>Новая поездка</h3>
      <div class="field"><label>Куда?</label><input id="trip-name" placeholder="Киото, Париж, Сочи..." /></div>
      <div class="field"><label>С</label><input type="date" id="start-date" /></div>
      <div class="field"><label>По</label><input type="date" id="end-date" /></div>
      <button class="btn" id="create-trip">Создать</button>
      <button class="btn ghost" id="cancel-modal" style="margin-top:8px;">Отмена</button>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#cancel-modal').onclick = () => modal.remove();
  modal.querySelector('#create-trip').onclick = () => {
    const name = modal.querySelector('#trip-name').value.trim();
    const start = modal.querySelector('#start-date').value;
    const end = modal.querySelector('#end-date').value;
    if (!name || !start || !end) return alert('Заполни все поля');
    const trip = {
      id: uid(),
      name,
      startDate: start,
      endDate: end,
      days: getDaysBetween(start, end)
    };
    state.trips.unshift(trip);
    save();
    modal.remove();
    state.currentTripId = trip.id;
    state.view = 'trip';
    render();
  };
}

function openAddPlaceModal(block) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <h3>Добавить место</h3>
      <div class="field"><label>Название</label><input id="place-name" placeholder="Fushimi Inari, кофейня..." /></div>
      <div class="field"><label>Заметка (необязательно)</label><textarea id="place-notes" rows="2"></textarea></div>
      <button class="btn" id="save-place">Добавить</button>
      <button class="btn ghost" id="cancel-modal" style="margin-top:8px;">Отмена</button>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#cancel-modal').onclick = () => modal.remove();
  modal.querySelector('#save-place').onclick = () => {
    const name = modal.querySelector('#place-name').value.trim();
    if (!name) return;
    const trip = state.trips.find(t => t.id === state.currentTripId);
    const day = trip.days[state.currentDayIndex];
    day.places.push({
      id: uid(),
      name,
      notes: modal.querySelector('#place-notes').value.trim(),
      timeBlock: block
    });
    save();
    modal.remove();
    render();
  };
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  });
}

load();
render();
