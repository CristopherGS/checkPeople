const DEFAULT_JSON_FILE = './________________________________________.json';
const STORAGE_KEY = 'json-explorer-state-v1';
const DELETED_ROWS_KEY = 'json-explorer-deleted-rows-v1';

const state = {
  rawData: [],
  filteredData: [],
  selectedIndex: 0,
  search: '',
  filters: {
    department: 'all',
    municipality: 'all',
    workStatus: 'all',
    civilStatus: 'all',
    ageMin: '',
    ageMax: '',
  },
  sort: {
    key: 'NOMBRE_COMPLETO',
    direction: 'asc',
  },
  columns: [],
  visibleColumns: new Set(),
  photoCache: new Map(),
  currentPhotoUrl: null,
  deletedRowKeys: new Set(),
};

const labels = {
  ID_RUE: 'ID RUE',
  NOMBRE_COMPLETO: 'Nombre completo',
  FECHA_NACIMIENTO: 'Fecha nacimiento',
  EDAD: 'Edad',
  TIENE_CONYUGE: 'Tiene cónyuge',
  TIENE_PADRE: 'Tiene padre',
  TIENE_HIJOS: 'Tiene hijos',
  NOMBRE_DEPARTAMENTO: 'Departamento',
  NOMBRE_MUNICIPIO: 'Municipio',
  DIRECCION_VIVIENDA: 'Dirección vivienda',
  EMAIL_PERSONAL: 'Correo personal',
  TELEFONO_CELULAR_PREFERENTE: 'Celular preferente',
  TELEFONO_CASA: 'Teléfono casa',
  ESTADO_CIVIL: 'Estado civil',
  NOMBRE_CONYUGE: 'Nombre cónyuge',
  LABORAL_ID: 'Laboral ID',
  PUESTO_FUNCIONAL: 'Puesto funcional',
  LABORAL_FECHA_INICIO: 'Inicio laboral',
  LABORAL_FECHA_FIN: 'Fin laboral',
  ESTADO_LABORAL: 'Estado laboral',
  EDIFICIO: 'Edificio',
  FOTO_ID: 'Foto ID',
  FOTO_FECHA: 'Foto fecha',
};

const grouping = {
  basics: [
    'ID_RUE',
    'NOMBRE_COMPLETO',
    'FECHA_NACIMIENTO',
    'EDAD',
    'ESTADO_CIVIL',
    'TIENE_CONYUGE',
    'TIENE_PADRE',
    'TIENE_HIJOS',
  ],
  contact: [
    'NOMBRE_DEPARTAMENTO',
    'NOMBRE_MUNICIPIO',
    'DIRECCION_VIVIENDA',
    'EMAIL_PERSONAL',
    'TELEFONO_CELULAR_PREFERENTE',
    'TELEFONO_CASA',
  ],
  labor: [
    'LABORAL_ID',
    'PUESTO_FUNCIONAL',
    'LABORAL_FECHA_INICIO',
    'LABORAL_FECHA_FIN',
    'ESTADO_LABORAL',
    'EDIFICIO',
    'FOTO_ID',
    'FOTO_FECHA',
  ],
};

const elements = {
  fileInput: document.getElementById('file-input'),
  reloadDefault: document.getElementById('reload-default'),
  searchInput: document.getElementById('search-input'),
  departmentFilter: document.getElementById('department-filter'),
  municipalityFilter: document.getElementById('municipality-filter'),
  workFilter: document.getElementById('work-filter'),
  civilFilter: document.getElementById('civil-filter'),
  ageMin: document.getElementById('age-min'),
  ageMax: document.getElementById('age-max'),
  clearFilters: document.getElementById('clear-filters'),
  resetColumns: document.getElementById('reset-columns'),
  deleteSelected: document.getElementById('delete-selected'),
  tableHead: document.getElementById('table-head'),
  tableBody: document.getElementById('table-body'),
  tableMeta: document.getElementById('table-meta'),
  columnPickerList: document.getElementById('column-picker-list'),
  detailName: document.getElementById('detail-name'),
  detailChip: document.getElementById('detail-chip'),
  detailPhoto: document.getElementById('detail-photo'),
  photoPlaceholder: document.getElementById('photo-placeholder'),
  detailGrid: document.getElementById('detail-grid'),
  statTotal: document.getElementById('stat-total'),
  statFiltered: document.getElementById('stat-filtered'),
  statPhotos: document.getElementById('stat-photos'),
  statAge: document.getElementById('stat-age'),
};

function humanize(key) {
  return labels[key] || key.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (char) => char.toUpperCase());
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function formatValue(key, value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`));
    }

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
      const [datePart, timePart] = value.split(' ');
      return `${new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(`${datePart}T00:00:00`))} ${timePart}`;
    }

    if (value === 'N') return 'No';
    if (value === 'S') return 'Sí';
    if (value === 'A') return 'Activo';
    if (value === 'B') return 'Baja';
  }

  return String(value);
}

function detectType(key, value) {
  if (value === null || value === undefined) return 'text';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/.test(value)) return 'date';
    if (/^-?\d+(\.\d+)?$/.test(value)) return 'number';
  }
  return 'text';
}

function parseComparable(key, value) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') return value;

  if (typeof value === 'string' && (/^\d+(\.\d+)?$/.test(value) || /^-?\d+$/.test(value))) {
    return Number(value);
  }

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/.test(value)) {
    return Date.parse(value.replace(' ', 'T'));
  }

  return normalizeText(value);
}

function getUniqueValues(key) {
  return Array.from(
    new Set(
      state.rawData
        .map((row) => row[key])
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map((value) => String(value)),
    ),
  ).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

function createSelectOptions(select, values, placeholder) {
  select.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = 'all';
  defaultOption.textContent = placeholder;
  select.appendChild(defaultOption);

  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function getRowKey(row) {
  return String(row.FOTO_ID ?? row.LABORAL_ID ?? row.ID_RUE ?? row.NOMBRE_COMPLETO ?? '');
}

function loadPersistedDeletedRows() {
  try {
    const saved = JSON.parse(localStorage.getItem(DELETED_ROWS_KEY) || 'null');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function persistDeletedRows() {
  localStorage.setItem(DELETED_ROWS_KEY, JSON.stringify(Array.from(state.deletedRowKeys)));
}

function buildColumns() {
  const keys = Array.from(
    new Set(
      state.rawData.flatMap((row) => Object.keys(row)).filter((key) => key !== 'FOTO_BLOB'),
    ),
  );

  const ordered = [
    'ID_RUE',
    'NOMBRE_COMPLETO',
    'NOMBRE_DEPARTAMENTO',
    'NOMBRE_MUNICIPIO',
    'EDAD',
    'ESTADO_CIVIL',
    'ESTADO_LABORAL',
    'LABORAL_FECHA_INICIO',
    'LABORAL_FECHA_FIN',
  ];

  const rest = keys.filter((key) => !ordered.includes(key));

  state.columns = ordered
    .filter((key) => keys.includes(key))
    .concat(rest)
    .map((key) => ({
      key,
      label: humanize(key),
      type: detectType(key, state.rawData[0]?.[key]),
    }));

  const persisted = loadPersistedColumns();
  if (persisted && persisted.length) {
    state.visibleColumns = new Set(
      persisted.filter((key) => state.columns.some((column) => column.key === key)),
    );
  } else {
    const defaultVisible = ['ID_RUE', 'NOMBRE_COMPLETO', 'NOMBRE_DEPARTAMENTO', 'NOMBRE_MUNICIPIO', 'EDAD', 'ESTADO_CIVIL', 'ESTADO_LABORAL', 'LABORAL_FECHA_INICIO'];
    state.visibleColumns = new Set(defaultVisible.filter((key) => state.columns.some((column) => column.key === key)));
  }

  state.columns.forEach((column) => {
    if (!state.visibleColumns.size) {
      state.visibleColumns.add(column.key);
    }
  });

  renderColumnPicker();
}

function renderColumnPicker() {
  elements.columnPickerList.innerHTML = '';

  state.columns.forEach((column) => {
    const item = document.createElement('label');
    item.className = 'picker-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.visibleColumns.has(column.key);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        state.visibleColumns.add(column.key);
      } else {
        state.visibleColumns.delete(column.key);
      }
      persistColumns();
      render();
    });

    const text = document.createElement('span');
    text.textContent = column.label;

    item.append(checkbox, text);
    elements.columnPickerList.appendChild(item);
  });
}

function persistColumns() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ visibleColumns: Array.from(state.visibleColumns) }));
}

function loadPersistedColumns() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return saved?.visibleColumns || null;
  } catch {
    return null;
  }
}

function applyFilters(data) {
  const search = normalizeText(state.search.trim());

  return data.filter((row) => {
    if (search) {
      const haystack = Object.entries(row)
        .filter(([key]) => key !== 'FOTO_BLOB')
        .map(([, value]) => normalizeText(value))
        .join(' | ');
      if (!haystack.includes(search)) return false;
    }

    if (state.filters.department !== 'all' && String(row.NOMBRE_DEPARTAMENTO ?? '') !== state.filters.department) return false;
    if (state.filters.municipality !== 'all' && String(row.NOMBRE_MUNICIPIO ?? '') !== state.filters.municipality) return false;
    if (state.filters.workStatus !== 'all' && String(row.ESTADO_LABORAL ?? '') !== state.filters.workStatus) return false;
    if (state.filters.civilStatus !== 'all' && String(row.ESTADO_CIVIL ?? '') !== state.filters.civilStatus) return false;

    const age = Number(row.EDAD);
    if (state.filters.ageMin !== '' && !Number.isNaN(Number(state.filters.ageMin)) && age < Number(state.filters.ageMin)) return false;
    if (state.filters.ageMax !== '' && !Number.isNaN(Number(state.filters.ageMax)) && age > Number(state.filters.ageMax)) return false;

    return true;
  });
}

function applySort(data) {
  const { key, direction } = state.sort;
  const multiplier = direction === 'asc' ? 1 : -1;

  return [...data].sort((left, right) => {
    const a = parseComparable(key, left[key]);
    const b = parseComparable(key, right[key]);

    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;

    if (typeof a === 'number' && typeof b === 'number') {
      return (a - b) * multiplier;
    }

    return String(a).localeCompare(String(b), 'es', { sensitivity: 'base' }) * multiplier;
  });
}

function findSelectedRow() {
  return state.filteredData[state.selectedIndex] || state.filteredData[0] || null;
}

function updateStats() {
  const photos = state.rawData.filter((row) => String(row.FOTO_BLOB ?? '').trim().length > 2).length;
  const ages = state.filteredData.map((row) => Number(row.EDAD)).filter((value) => Number.isFinite(value));
  const averageAge = ages.length ? (ages.reduce((sum, value) => sum + value, 0) / ages.length).toFixed(1) : '—';

  elements.statTotal.textContent = state.rawData.length.toString();
  elements.statFiltered.textContent = state.filteredData.length.toString();
  elements.statPhotos.textContent = photos.toString();
  elements.statAge.textContent = averageAge;
  elements.tableMeta.textContent = state.rawData.length
    ? `${state.filteredData.length} de ${state.rawData.length} registros visibles. Haz clic en un encabezado para ordenar.`
    : 'Carga un JSON para comenzar.';
}

function renderTable() {
  const visibleColumns = state.columns.filter((column) => state.visibleColumns.has(column.key));

  elements.tableHead.innerHTML = '';

  const photoHeader = document.createElement('th');
  photoHeader.textContent = 'Foto';
  elements.tableHead.appendChild(photoHeader);

  const actionHeader = document.createElement('th');
  actionHeader.textContent = 'Acciones';
  elements.tableHead.appendChild(actionHeader);

  visibleColumns.forEach((column) => {
    const th = document.createElement('th');
    th.className = 'sortable';
    th.dataset.key = column.key;
    th.setAttribute('role', 'button');
    th.setAttribute('tabindex', '0');

    const active = state.sort.key === column.key;
    const indicator = active ? (state.sort.direction === 'asc' ? '↑' : '↓') : '↕';
    th.innerHTML = `${column.label} <span class="sort-indicator">${indicator}</span>`;

    const sortByColumn = () => {
      if (state.sort.key === column.key) {
        state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        state.sort.key = column.key;
        state.sort.direction = 'asc';
      }
      render();
    };

    th.addEventListener('click', sortByColumn);
    th.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        sortByColumn();
      }
    });

    elements.tableHead.appendChild(th);
  });

  elements.tableBody.innerHTML = '';

  if (!state.filteredData.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = visibleColumns.length + 2;
    cell.className = 'empty-state';
    cell.textContent = state.rawData.length ? 'No hay resultados con los filtros actuales.' : 'Carga un archivo JSON para ver la tabla.';
    row.appendChild(cell);
    elements.tableBody.appendChild(row);
    updateDetail(null);
    updateStats();
    return;
  }

  state.filteredData.forEach((rowData, index) => {
    const row = document.createElement('tr');
    row.className = index === state.selectedIndex ? 'active' : '';
    row.tabIndex = 0;

    const photoCell = document.createElement('td');
    const photoButton = document.createElement('button');
    photoButton.className = 'table-photo-btn';
    photoButton.type = 'button';
    photoButton.textContent = rowData.FOTO_BLOB ? 'Ver foto' : 'Sin foto';
    photoButton.addEventListener('click', (event) => {
      event.stopPropagation();
      selectRow(index);
    });
    photoCell.appendChild(photoButton);
    row.appendChild(photoCell);

    const actionCell = document.createElement('td');
    const deleteButton = document.createElement('button');
    deleteButton.className = 'table-delete-btn';
    deleteButton.type = 'button';
    deleteButton.textContent = 'Eliminar';
    deleteButton.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteRow(rowData);
    });
    actionCell.appendChild(deleteButton);
    row.appendChild(actionCell);

    visibleColumns.forEach((column) => {
      const cell = document.createElement('td');
      cell.textContent = formatValue(column.key, rowData[column.key]);
      row.appendChild(cell);
    });

    row.addEventListener('click', () => selectRow(index));
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectRow(index);
      }
    });

    elements.tableBody.appendChild(row);
  });

  updateStats();
}

function buildDetailGroups(row) {
  elements.detailGrid.innerHTML = '';

  const groups = [
    { title: 'Perfil', fields: grouping.basics },
    { title: 'Contacto', fields: grouping.contact },
    { title: 'Laboral', fields: grouping.labor },
  ];

  groups.forEach((group) => {
    const template = document.getElementById('detail-group-template');
    const fragment = template.content.cloneNode(true);
    const section = fragment.querySelector('.detail-group');
    const heading = section.querySelector('h3');
    const list = section.querySelector('dl');

    heading.textContent = group.title;

    group.fields.forEach((key) => {
      if (!(key in row)) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'row';
      const term = document.createElement('dt');
      term.textContent = humanize(key);
      const description = document.createElement('dd');
      description.textContent = formatValue(key, row[key]);
      wrapper.append(term, description);
      list.appendChild(wrapper);
    });

    if (list.children.length) {
      elements.detailGrid.appendChild(fragment);
    }
  });
}

function buildPhotoUrl(row) {
  const cacheKey = row.FOTO_ID ?? row.ID_RUE ?? row.NOMBRE_COMPLETO;
  if (state.photoCache.has(cacheKey)) {
    return state.photoCache.get(cacheKey);
  }

  const rawHex = String(row.FOTO_BLOB ?? '').replace(/^'+|'+$/g, '').replace(/[^0-9a-fA-F]/g, '');
  if (!rawHex.length) return null;

  const evenHex = rawHex.length % 2 === 0 ? rawHex : rawHex.slice(0, -1);
  const bytes = new Uint8Array(evenHex.length / 2);

  for (let index = 0; index < evenHex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(evenHex.slice(index, index + 2), 16);
  }

  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
  state.photoCache.set(cacheKey, url);
  return url;
}

function deleteRow(row) {
  const key = getRowKey(row);
  if (!key) return;

  state.deletedRowKeys.add(key);
  persistDeletedRows();
  state.rawData = state.rawData.filter((item) => getRowKey(item) !== key);
  state.selectedIndex = 0;
  buildColumns();
  populateFilters();
  syncFiltersFromUI();
}

function updateDetail(row) {
  if (!row) {
    elements.detailName.textContent = 'Sin selección';
    elements.detailChip.textContent = state.rawData.length ? 'Sin resultados' : 'Esperando datos';
    elements.photoPlaceholder.style.display = 'block';
    elements.photoPlaceholder.textContent = state.rawData.length
      ? 'No hay un registro activo. Usa la tabla para abrir el detalle.'
      : 'La foto aparecerá aquí al seleccionar un registro.';
    elements.detailPhoto.style.display = 'none';
    elements.detailPhoto.removeAttribute('src');
    elements.detailGrid.innerHTML = '';
    return;
  }

  elements.detailName.textContent = row.NOMBRE_COMPLETO || `Registro ${row.ID_RUE ?? ''}`;
  elements.detailChip.textContent = row.ESTADO_LABORAL ? formatValue('ESTADO_LABORAL', row.ESTADO_LABORAL) : 'Detalle activo';
  buildDetailGroups(row);

  const photoUrl = buildPhotoUrl(row);
  state.currentPhotoUrl = photoUrl;

  if (photoUrl) {
    elements.photoPlaceholder.style.display = 'none';
    elements.detailPhoto.src = photoUrl;
    elements.detailPhoto.style.display = 'block';
  } else {
    elements.detailPhoto.style.display = 'none';
    elements.detailPhoto.removeAttribute('src');
    elements.photoPlaceholder.style.display = 'block';
    elements.photoPlaceholder.textContent = 'Este registro no tiene foto disponible.';
  }
}

function selectRow(index) {
  state.selectedIndex = index;
  render();
}

function render() {
  state.filteredData = applySort(applyFilters(state.rawData));
  if (state.selectedIndex >= state.filteredData.length) {
    state.selectedIndex = 0;
  }
  renderTable();
  updateDetail(findSelectedRow());
}

function syncFiltersFromUI() {
  state.search = elements.searchInput.value;
  state.filters.department = elements.departmentFilter.value;
  state.filters.municipality = elements.municipalityFilter.value;
  state.filters.workStatus = elements.workFilter.value;
  state.filters.civilStatus = elements.civilFilter.value;
  state.filters.ageMin = elements.ageMin.value;
  state.filters.ageMax = elements.ageMax.value;
  state.selectedIndex = 0;
  render();
}

function resetFilters() {
  elements.searchInput.value = '';
  elements.departmentFilter.value = 'all';
  elements.municipalityFilter.value = 'all';
  elements.workFilter.value = 'all';
  elements.civilFilter.value = 'all';
  elements.ageMin.value = '';
  elements.ageMax.value = '';
  syncFiltersFromUI();
}

function restoreDefaultColumns() {
  const defaultVisible = ['ID_RUE', 'NOMBRE_COMPLETO', 'NOMBRE_DEPARTAMENTO', 'NOMBRE_MUNICIPIO', 'EDAD', 'ESTADO_CIVIL', 'ESTADO_LABORAL', 'LABORAL_FECHA_INICIO'];
  state.visibleColumns = new Set(defaultVisible.filter((key) => state.columns.some((column) => column.key === key)));
  persistColumns();
  renderColumnPicker();
  render();
}

async function loadDefaultJson() {
  try {
    const response = await fetch(DEFAULT_JSON_FILE, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    loadData(data, 'Archivo local cargado correctamente.');
  } catch (error) {
    elements.tableMeta.textContent = 'No pude cargar el JSON automáticamente. Usa el botón Cargar JSON para seleccionar el archivo manualmente.';
    console.warn('No se pudo cargar el JSON por defecto:', error);
  }
}

function loadData(data, message) {
  if (!Array.isArray(data)) {
    throw new Error('El JSON debe ser un arreglo de registros.');
  }

  state.deletedRowKeys = new Set(loadPersistedDeletedRows());
  state.rawData = data.filter((row) => !state.deletedRowKeys.has(getRowKey(row)));
  state.selectedIndex = 0;
  buildColumns();
  populateFilters();
  syncFiltersFromUI();

  if (message) {
    elements.tableMeta.textContent = message;
  }
}

function populateFilters() {
  createSelectOptions(elements.departmentFilter, getUniqueValues('NOMBRE_DEPARTAMENTO'), 'Todos los departamentos');
  createSelectOptions(elements.municipalityFilter, getUniqueValues('NOMBRE_MUNICIPIO'), 'Todos los municipios');
  createSelectOptions(elements.workFilter, getUniqueValues('ESTADO_LABORAL'), 'Todos los estados');
  createSelectOptions(elements.civilFilter, getUniqueValues('ESTADO_CIVIL'), 'Todos los estados civiles');
}

function wireEvents() {
  elements.fileInput.addEventListener('change', async () => {
    const file = elements.fileInput.files?.[0];
    if (!file) return;

    const text = await file.text();
    const parsed = JSON.parse(text);
    loadData(parsed, `Archivo cargado: ${file.name}`);
  });

  elements.reloadDefault.addEventListener('click', loadDefaultJson);
  elements.searchInput.addEventListener('input', syncFiltersFromUI);
  elements.departmentFilter.addEventListener('change', syncFiltersFromUI);
  elements.municipalityFilter.addEventListener('change', syncFiltersFromUI);
  elements.workFilter.addEventListener('change', syncFiltersFromUI);
  elements.civilFilter.addEventListener('change', syncFiltersFromUI);
  elements.ageMin.addEventListener('input', syncFiltersFromUI);
  elements.ageMax.addEventListener('input', syncFiltersFromUI);
  elements.clearFilters.addEventListener('click', resetFilters);
  elements.resetColumns.addEventListener('click', restoreDefaultColumns);
  elements.deleteSelected.addEventListener('click', () => {
    const row = findSelectedRow();
    if (row) deleteRow(row);
  });
}

wireEvents();
loadDefaultJson();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((error) => {
    console.warn('Service worker registration failed:', error);
  });
}