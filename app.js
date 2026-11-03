const STORAGE_KEY = 'trip-planner-v2';
const DB_NAME = 'trip-planner-files';
const DB_VERSION = 1;

let state = {
  trips: [],
  currentTripId: null,
  currentDayIndex: null,
  view: 'home',
  timelineMode: false
};

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function saveFile(logId, file) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    const store = tx.objectStore('files');
    const id = uid();
    store.put({
      id,
      logId,
      name: file.name,
      type: file.type,
      blob: file
    });
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

async function getFilesForLog(logId) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('files', 'readonly');
    const store = tx.objectStore('files');
    const req = store.getAll();
    req.onsuccess = () => {
      resolve((req.result || []).filter(f => f.logId === logId));
    };
    req.onerror = () => resolve([]);
  });
}

async function deleteFilesForLog(logId) {
  const files = await getFilesForLog(logId);
  if (!files.length) return;
  const db = await openDB();
  const tx = db.transaction('files', 'readwrite');
  const store = tx.objectStore('files');
  files.forEach(f => store.delete(f.id));
  return new Promise(r => { tx.oncomplete = r; });
}

function load() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) raw = localStorage.getItem('trip-planner-v1');
    if (raw) {
      state.trips = JSON.parse(raw);
      state.trips.forEach(t => {
        if (!t.logistics) t.logistics = [];
      });
    }
  } catch (e) {}
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.trips));
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function formatDateTime(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
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
  else if (state.view === 'trip') renderTripAsync();
  else if (state.view === 'day') app.innerHTML = renderDay();
  bindEvents();
}

async function renderTripAsync() {
  const app = document.getElementById('app');
  app.innerHTML = await renderTrip();
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

function typeIcon(type) {
  const map = { ticket: '🎫', hotel: '🏨', transport: '🚇', other: '📎' };
  return map[type] || '📎';
}

function typeLabel(type) {
  const map = { ticket: 'Билет', hotel: 'Жильё', transport: 'Транспорт', other: 'Другое' };
  return map[type] || 'Другое';
}

function travelTimesHtml(trip) {
  const parts = [];
  if (trip.departureTime) parts.push(`🛫 Вылет/выезд: ${formatDateTime(trip.departureTime)}`);
  if (trip.destinationArrivalTime) parts.push(`🛬 Прилёт в ${trip.name}: ${formatDateTime(trip.destinationArrivalTime)}`);
  if (trip.destinationDepartureTime) parts.push(`🛫 Вылет из ${trip.name}: ${formatDateTime(trip.destinationDepartureTime)}`);
  if (trip.returnArrivalTime) parts.push(`🛬 Прилёт/приезд обратно: ${formatDateTime(trip.returnArrivalTime)}`);
  if (!parts.length) return '';
  return `<div class="card" style="padding:16px;margin-bottom:16px;background:#f0fdfa;">
    <div style="font-weight:600;margin-bottom:8px;">Время в пути</div>
    ${parts.map(p => `<div style="font-size:0.9rem;margin:4px 0;">${p}</div>`).join('')}
  </div>`;
}

async function renderTrip() {
  const trip = state.trips.find(t => t.id === state.currentTripId);
  if (!trip) return renderHome();

  let logisticsHtml = '';
  for (const item of (trip.logistics || [])) {
    const files = await getFilesForLog(item.id);
    const filesHtml = files.map(f => `
      <div style="margin-top:6px;">
        <a href="#" data-action="download-file" data-file-id="${f.id}" style="color:var(--accent);font-size:0.9rem;">📎 ${f.name}</a>
      </div>
    `).join('');

    logisticsHtml += `
      <div class="card" style="padding:16px;">
        <div style="display:flex;align-items:flex-start;gap:12px;">
          <div class="place-icon">${typeIcon(item.type)}</div>
          <div style="flex:1;">
            <div style="font-weight:600;">${item.title}</div>
            <div class="sub" style="color:var(--muted);font-size:0.85rem;">${typeLabel(item.type)}${item.date ? ' · ' + formatDate(item.date) : ''}</div>
            ${item.details ? `<div style="margin-top:6px;font-size:0.9rem;">${item.details}</div>` : ''}
            ${item.link ? `<a href="${item.link}" target="_blank" style="color:var(--accent);font-size:0.9rem;display:inline-block;margin-top:6px;">Открыть ссылку →</a>` : ''}
            ${filesHtml}
          </div>
          <button data-action="delete-logistics" data-id="${item.id}" style="background:none;border:none;color:#94a3b8;font-size:1.2rem;">×</button>
        </div>
      </div>
    `;
  }

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
      ${travelTimesHtml(trip)}
      <h3 style="margin:16px 0 8px;font-size:1.1rem;">Билеты и логистика</h3>
      ${logisticsHtml || '<div style="color:var(--muted);padding:8px 0 16px;">Пока ничего не добавлено</div>'}
      <button class="btn secondary" data-action="add-logistics">+ Добавить билет / жильё / транспорт</button>

      <h3 style="margin:24px 0 8px;font-size:1.1rem;">Маршрут по дням</h3>
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
    el.onclick = async (e) => {
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
      if (action === 'add-logistics') openAddLogisticsModal();
      if (action === 'delete-place') {
        const trip = state.trips.find(t => t.id === state.currentTripId);
        const day = trip.days[state.currentDayIndex];
        day.places = day.places.filter(p => p.id !== el.dataset.id);
        save();
        render();
      }
      if (action === 'delete-logistics') {
        const trip = state.trips.find(t => t.id === state.currentTripId);
        const id = el.dataset.id;
        await deleteFilesForLog(id);
        trip.logistics = trip.logistics.filter(i => i.id !== id);
        save();
        render();
      }
      if (action === 'download-file') {
        e.preventDefault();
        const fileId = el.dataset.fileId;
        const db = await openDB();
        const tx = db.transaction('files', 'readonly');
        const store = tx.objectStore('files');
        const req = store.get(fileId);
        req.onsuccess = () => {
          const rec = req.result;
          if (!rec) return;
          const url = URL.createObjectURL(rec.blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = rec.name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        };
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

      <div class="field" style="margin-top:20px;">
        <label>Время вылета / выезда</label>
        <input type="datetime-local" id="departure-time" />
      </div>
      <div class="field">
        <label>Время прилёта / приезда обратно</label>
        <input type="datetime-local" id="return-arrival-time" />
      </div>

      <div style="margin:16px 0 8px;font-size:0.9rem;color:var(--muted);">Опционально — времена в городе назначения</div>
      <div class="field">
        <label>Прилёт в город назначения</label>
        <input type="datetime-local" id="dest-arrival-time" />
      </div>
      <div class="field">
        <label>Вылет из города назначения</label>
        <input type="datetime-local" id="dest-departure-time" />
      </div>

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
    if (!name || !start || !end) return alert('Заполни название и даты');

    const trip = {
      id: uid(),
      name,
      startDate: start,
      endDate: end,
      departureTime: modal.querySelector('#departure-time').value || null,
      returnArrivalTime: modal.querySelector('#return-arrival-time').value || null,
      destinationArrivalTime: modal.querySelector('#dest-arrival-time').value || null,
      destinationDepartureTime: modal.querySelector('#dest-departure-time').value || null,
      days: getDaysBetween(start, end),
      logistics: []
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

function openAddLogisticsModal() {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <h3>Добавить билет / жильё / транспорт</h3>
      <div class="field">
        <label>Тип</label>
        <select id="log-type">
          <option value="ticket">Билет (самолёт, поезд, автобус)</option>
          <option value="hotel">Жильё</option>
          <option value="transport">Транспорт в городе</option>
          <option value="other">Другое</option>
        </select>
      </div>
      <div class="field"><label>Название</label><input id="log-title" placeholder="Рейс SU123, отель в центре, проездной..." /></div>
      <div class="field"><label>Дата (необязательно)</label><input type="date" id="log-date" /></div>
      <div class="field"><label>Детали / номер брони / заметка</label><textarea id="log-details" rows="3" placeholder="Время вылета, адрес, номер бронирования..."></textarea></div>
      <div class="field"><label>Ссылка (необязательно)</label><input id="log-link" placeholder="https://..." /></div>
      <div class="field">
        <label>Файлы (билеты, подтверждения, фото)</label>
        <input type="file" id="log-files" multiple accept="image/*,.pdf,.doc,.docx,.txt" />
        <div style="font-size:0.8rem;color:var(--muted);margin-top:4px;">Можно несколько. Хранятся только на этом устройстве.</div>
      </div>
      <button class="btn" id="save-log">Добавить</button>
      <button class="btn ghost" id="cancel-modal" style="margin-top:8px;">Отмена</button>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#cancel-modal').onclick = () => modal.remove();
  modal.querySelector('#save-log').onclick = async () => {
    const title = modal.querySelector('#log-title').value.trim();
    if (!title) return alert('Напиши название');
    const trip = state.trips.find(t => t.id === state.currentTripId);
    if (!trip.logistics) trip.logistics = [];
    const logId = uid();
    trip.logistics.push({
      id: logId,
      type: modal.querySelector('#log-type').value,
      title,
      date: modal.querySelector('#log-date').value || null,
      details: modal.querySelector('#log-details').value.trim(),
      link: modal.querySelector('#log-link').value.trim()
    });

    const fileInput = modal.querySelector('#log-files');
    if (fileInput.files.length) {
      for (const file of fileInput.files) {
        try {
          await saveFile(logId, file);
        } catch (err) {
          console.warn('File save failed', err);
        }
      }
    }

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
