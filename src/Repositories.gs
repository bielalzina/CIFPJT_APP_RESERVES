/**
 * src/Repositories.gs
 * Data access layer using Google Sheets as a database.
 * Provides generic helpers and specific CRUD functions.
 * CIFP JT
 */

// ==========================================
// GENERIC HELPERS
// ==========================================

/**
 * STRATEGY: Schema-driven Trust
 * The `CONFIG.SCHEMAS` definition is the single source of truth.
 * All reads and writes enforce this schema. If the actual target spreadsheet 
 * is missing a required column defined in the schema, the repository will throw an error 
 * to prevent data corruption.
 */

let _cachedSpreadsheet = null;

/**
 * Gets the centralized Spreadsheet instance.
 * Caches the active spreadsheet so we don't repeatedly call the App Service.
 * @returns {Spreadsheet}
 */
function getSpreadsheet_() {
  if (!_cachedSpreadsheet) {
    _cachedSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!_cachedSpreadsheet) throw new Error('No active spreadsheet found.');
  }
  return _cachedSpreadsheet;
}

/**
 * Gets a sheet by name from the centralized spreadsheet.
 * @param {string} sheetName 
 * @returns {Sheet}
 */
function getSheet_(sheetName) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);
  return sheet;
}

/**
 * Validates that all required headers from the schema exist in the sheet's actual headers.
 * Computes and returns the index mapping so we only search for columns once.
 * 
 * @param {string[]} requiredHeaders 
 * @param {string[]} actualHeaders 
 * @returns {Object} Mapping of header names to their 0-based column index.
 */
function getHeaderMapping_(requiredHeaders, actualHeaders) {
  const mapping = {};
  const missing = [];
  
  requiredHeaders.forEach(header => {
    const idx = actualHeaders.indexOf(header);
    if (idx === -1) missing.push(header);
    mapping[header] = idx;
  });
  
  if (missing.length > 0) {
    throw new Error(`Schema mismatch. Missing columns: ${missing.join(', ')}`);
  }
  
  return mapping;
}

/**
 * Normalizes date values coming from the spreadsheet specifically for the canonical reservation date (YYYY-MM-DD).
 * @param {*} value The raw cell value
 * @returns {string} The normalized YYYY-MM-DD string.
 */
function normalizeReservationDate_(value) {
  if (!value) return value;
  
  try {
    let d;
    if (value instanceof Date) {
      d = value;
    } else {
      d = new Date(value);
    }
    
    if (isNaN(d.getTime())) return value; // Return as-is if unparsable 
    
    // We want the local YYYY-MM-DD representing what the user saw in the sheet.
    // Apps Script runs in the script's timezone by default.
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  } catch(e) {
    return value;
  }
}

/**
 * Reads all data from a sheet and maps to an array of objects based on schema.
 * @param {string} sheetName
 * @param {string[]} headersArray (The Schema)
 * @returns {Object[]}
 */
function readAll_(sheetName, headersArray) {
  const sheet = getSheet_(sheetName);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // Empty or only headers
  
  const actualHeaders = data[0];
  const mapping = getHeaderMapping_(headersArray, actualHeaders);
  const rows = data.slice(1);
  
  return rows.map((row, rowIndex) => {
    let obj = { _rowIndex: rowIndex + 2 }; // +2 for 1-based index and header row
    headersArray.forEach(header => {
      const colIndex = mapping[header];
      const val = row[colIndex];
      
      if (header === 'date') {
        obj[header] = normalizeReservationDate_(val);
      } else if (val instanceof Date) {
        // Preserve standard timestamp fields (createdAt, updatedAt)
        obj[header] = val.toISOString();
      } else {
        obj[header] = val;
      }
    });
    return obj;
  });
}

/**
 * Appends a single row to a sheet.
 * @param {string} sheetName
 * @param {string[]} headersArray (The Schema)
 * @param {Object} objData
 */
function createRow_(sheetName, headersArray, objData) {
  const sheet = getSheet_(sheetName);
  const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  getHeaderMapping_(headersArray, actualHeaders); // Validate schema before writing
  
  const newRow = actualHeaders.map(header => {
    return objData[header] !== undefined ? objData[header] : '';
  });
  
  sheet.appendRow(newRow);
  return objData;
}

/**
 * Updates an entire row given its 1-based index.
 * @param {string} sheetName
 * @param {string[]} headersArray (The Schema)
 * @param {number} rowIndex
 * @param {Object} objData
 */
function updateRow_(sheetName, headersArray, rowIndex, objData) {
  const sheet = getSheet_(sheetName);
  const actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  getHeaderMapping_(headersArray, actualHeaders); // Validate schema
  
  const newRowData = actualHeaders.map(header => {
    return objData[header] !== undefined ? objData[header] : '';
  });
  
  sheet.getRange(rowIndex, 1, 1, newRowData.length).setValues([newRowData]);
  return objData;
}

/**
 * Hard deletes a row by its 1-based index.
 * @param {string} sheetName
 * @param {number} rowIndex 
 */
function deleteRow_(sheetName, rowIndex) {
  const sheet = getSheet_(sheetName);
  sheet.deleteRow(rowIndex);
}

/**
 * Generates a unique UUID-ish string.
 */
function generateId_() {
  return Utilities.getUuid();
}


// ==========================================
// BASE REPOSITORY FACTORY
// ==========================================

/**
 * Factory class to reduce duplicate CRUD boilerplate.
 * Generates the standard DB layer methods for a given sheet.
 */
function createBaseRepository(sheetName, schemaHeaders) {
  return {
    sheetName: sheetName,
    headers: schemaHeaders,
    
    getAll: function() {
      return readAll_(this.sheetName, this.headers);
    },
    
    getById: function(id) {
      if (!this.headers.includes('id')) throw new Error('Repository schema lacks ID column.');
      return this.getAll().find(item => item.id === id);
    },
    
    create: function(objData) {
      if (this.headers.includes('id') && !objData.id) {
        objData.id = generateId_();
      }
      return createRow_(this.sheetName, this.headers, objData);
    },
    
    update: function(id, updateObj) {
      const items = this.getAll();
      const item = items.find(i => i.id === id);
      if (!item) throw new Error(`${this.sheetName} record not found: ${id}`);
      
      const updatedItem = { ...item, ...updateObj, id: id };
      delete updatedItem._rowIndex;
      
      return updateRow_(this.sheetName, this.headers, item._rowIndex, updatedItem);
    },
    
    delete: function(id) {
      const item = this.getById(id);
      if (!item) throw new Error(`${this.sheetName} record not found: ${id}`);
      deleteRow_(this.sheetName, item._rowIndex);
    }
  };
}


// ==========================================
// SPECIFIC REPOSITORIES
// ==========================================

const UsersRepo = {
  ...createBaseRepository(CONFIG.SHEETS.USERS, CONFIG.SCHEMAS.USERS),
  
  // Override ID-based methods as Users use email as primary key
  getById: undefined,
  update: undefined,
  delete: undefined,
  
  getByEmail: function(email) {
    return this.getAll().find(u => u.email === email);
  },

  create: function(userObj) {
    if (this.getByEmail(userObj.email)) throw new Error('User already exists');
    return createRow_(this.sheetName, this.headers, userObj);
  },

  updateByEmail: function(email, updateObj) {
    const users = this.getAll();
    const user = users.find(u => u.email === email);
    if (!user) throw new Error('User not found');

    const updatedUser = { ...user, ...updateObj, email: email };
    delete updatedUser._rowIndex;
    
    return updateRow_(this.sheetName, this.headers, user._rowIndex, updatedUser);
  },
  
  deleteByEmail: function(email) {
    const user = this.getByEmail(email);
    if (!user) throw new Error('User not found');
    deleteRow_(this.sheetName, user._rowIndex);
  }
};


const ResourcesRepo = {
  ...createBaseRepository(CONFIG.SHEETS.RESOURCES, CONFIG.SCHEMAS.RESOURCES),
  
  create: function(resourceObj) {
    resourceObj.id = generateId_();
    if (resourceObj.active === undefined) resourceObj.active = true;
    return createRow_(this.sheetName, this.headers, resourceObj);
  }
};


const RestrictionsRepo = {
  ...createBaseRepository(CONFIG.SHEETS.RESTRICTIONS, CONFIG.SCHEMAS.RESTRICTIONS),
  
  getByResourceId: function(resourceId) {
    return this.getAll().filter(r => r.resourceId === resourceId);
  }
};


const ReservationsRepo = {
  ...createBaseRepository(CONFIG.SHEETS.RESERVATIONS, CONFIG.SCHEMAS.RESERVATIONS),

  getAllActive: function() {
    // Soft deletions check
    return this.getAll().filter(r => r.status && r.status !== 'deleted');
  },

  getByResourceAndDate: function(resourceId, dateStr) {
    // Both dateStr and r.date are expected to be canonical YYYY-MM-DD
    return this.getAllActive().filter(r => r.resourceId === resourceId && String(r.date) === String(dateStr));
  },

  getByUser: function(userEmail) {
    return this.getAllActive().filter(r => r.userEmail === userEmail);
  },

  create: function(reservationObj) {
    reservationObj.id = generateId_();
    
    const now = new Date().toISOString();
    reservationObj.createdAt = now;
    reservationObj.updatedAt = now;
    
    if (!reservationObj.status) reservationObj.status = 'active';

    return createRow_(this.sheetName, this.headers, reservationObj);
  },

  update: function(id, updateObj) {
    const items = this.getAll();
    const reservation = items.find(r => r.id === id);
    if (!reservation) throw new Error('Reservation not found');

    // Prevent overwriting creation date
    const updatedReservation = { ...reservation, ...updateObj, id: id, createdAt: reservation.createdAt };
    updatedReservation.updatedAt = new Date().toISOString();
    delete updatedReservation._rowIndex;
    
    return updateRow_(this.sheetName, this.headers, reservation._rowIndex, updatedReservation);
  },

  delete: function(id) {
    // Soft delete implementation
    return this.update(id, { status: 'deleted' });
  },
  
  hardDelete: function(id) {
    const reservation = this.getAll().find(r => r.id === id);
    if (!reservation) throw new Error('Reservation not found');
    deleteRow_(this.sheetName, reservation._rowIndex);
  }
};
