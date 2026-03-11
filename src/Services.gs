/**
 * src/Services.gs
 * Business logic layer for the Reservation System.
 * Connects controllers to repositories while enforcing domain rules,
 * validations, permissions, and concurrency locks.
 * CIFP JT
 */

// ==========================================
// AUTHENTICATION & AUTHORIZATION SERVICE
// ==========================================

const AuthService = {
  /**
   * Resolves the identity of the current user.
   * Note: May return empty string depending on Google Workspace deployment mode.
   * @returns {string} The active user's email.
   */
  getCurrentUserEmail: function() {
    return Session.getActiveUser().getEmail();
  },

  /**
   * Retrieves the user record from the repository.
   * @param {string} email 
   * @returns {Object|null}
   */
  getUserRecord: function(email) {
    if (!email) return null;
    return UsersRepo.getByEmail(email) || null;
  },

  /**
   * Checks if the user is an administrator.
   * @param {string} email 
   * @returns {boolean}
   */
  isAdmin: function(email) {
    const user = this.getUserRecord(email);
    return user && ValidationService.parseActiveFlag(user.active) && user.role === CONFIG.ROLES.ADMIN;
  },

  /**
   * Checks if the user is allowed to make reservations (admin or teacher).
   * @param {string} email 
   * @returns {boolean}
   */
  canReserve: function(email) {
    const user = this.getUserRecord(email);
    if (!user || !ValidationService.parseActiveFlag(user.active)) return false;
    return user.role === CONFIG.ROLES.ADMIN || user.role === CONFIG.ROLES.TEACHER;
  },
  
  /**
   * Throws an error if the user cannot reserve.
   * @param {string} email 
   */
  requireCanReserve: function(email) {
    if (!this.canReserve(email)) {
      throw new Error(`Error d'autorització: L'usuari ${email} no té permisos de reserva.`);
    }
  },

  /**
   * Throws an error if the user is not an admin.
   * @param {string} email 
   */
  requireAdmin: function(email) {
    if (!this.isAdmin(email)) {
      throw new Error(`Error d'autorització: L'usuari ${email} requereix permisos d'administrador.`);
    }
  }
};


// ==========================================
// VALIDATION SERVICE
// ==========================================

const ValidationService = {
  /**
   * Central helper to interpret boolean or string flags from Google Sheets.
   * @param {*} value
   * @returns {boolean}
   */
  parseActiveFlag: function(value) {
    if (value === undefined || value === null) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
      const lower = value.trim().toLowerCase();
      return lower === 'true' || lower === '1' || lower === 'yes';
    }
    return false;
  },

  /**
   * Validates required presence of fields.
   * @param {Object} obj 
   * @param {string[]} requiredFields 
   */
  requireFields: function(obj, requiredFields) {
    const missing = requiredFields.filter(field => obj[field] === undefined || obj[field] === null || obj[field] === '');
    if (missing.length > 0) {
      throw new Error(`Error de validació: Falten camps obligatoris: ${missing.join(', ')}`);
    }
  },

  /**
   * Validates that the provided timeSlot is within the configured TIME_SLOTS.
   * @param {string} timeSlot 
   */
  validateTimeSlot: function(timeSlot) {
    if (!CONFIG.TIME_SLOTS.includes(timeSlot)) {
      throw new Error(`Error de validació: Franja horària invàlida '${timeSlot}'.`);
    }
  },

  /**
   * Validates that a date string is Monday-Friday.
   * Uses canonical YYYY-MM-DD.
   * @param {string} dateStr (YYYY-MM-DD)
   */
  validateWeekday: function(dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new Error(`Error de validació: Format de data invàlid '${dateStr}', s'esperava YYYY-MM-DD.`);
    }
    
    // Parse strictly as UTC to avoid local timezone shifting the day of week.
    // e.g., '2026-03-08' -> UTC 2026-03-08T00:00:00Z
    const [year, month, day] = dateStr.split('-');
    const date = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10)));
    
    // 0 is Sunday, 6 is Saturday
    const dayOfWeek = date.getUTCDay(); 
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      throw new Error(`Error de validació: Les reserves només es permeten de dilluns a divendres.`);
    }
  },

  /**
   * Validates if a resource type is allowed.
   * @param {string} type 
   */
  validateResourceType: function(type) {
    const allowed = ['classroom', 'auditorium', 'laptop_cart'];
    if (!allowed.includes(type)) {
      throw new Error(`Error de validació: Tipus de recurs desconegut '${type}'.`);
    }
  },

  /**
   * Validates quantity limits against resource capacity.
   * @param {number} quantity 
   * @param {Object} resource 
   */
  validateQuantity: function(quantity, resource) {
    if (isNaN(quantity) || quantity <= 0) {
      throw new Error(`Error de validació: La quantitat ha de ser major que 0.`);
    }
    
    // Convert capacity to number in case it's a string from Sheets
    const capacityNum = Number(resource.capacity);
    if (quantity > capacityNum) {
      throw new Error(`Error de validació: La quantitat sol·licitada (${quantity}) supera la capacitat del recurs (${capacityNum}).`);
    }
  }
};


// ==========================================
// AVAILABILITY SERVICE
// ==========================================

const AvailabilityService = {
  /**
   * Checks if a resource is blocked by a recurring restriction on the given date/slot.
   * @param {string} resourceId 
   * @param {string} dateStr (YYYY-MM-DD)
   * @param {string} timeSlot 
   */
  checkRestrictions: function(resourceId, dateStr, timeSlot) {
    const [year, month, day] = dateStr.split('-');
    const date = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10)));
    const dayOfWeek = date.getUTCDay(); // 0-6
    
    const restrictions = RestrictionsRepo.getByResourceId(resourceId);
    
    for (const res of restrictions) {
      // Direct comparison of day and the specific hour slot
      if (Number(res.dayOfWeek) === dayOfWeek && res.timeSlot === timeSlot) {
        throw new Error(`No disponible: El recurs està bloquejat per la restricció: ${res.description}`);
      }
    }
  },

  /**
   * Checks if the resource is fully available for the requested quantity.
   * @param {Object} resource 
   * @param {string} dateStr 
   * @param {string} timeSlot 
   * @param {number} requestedQty 
   * @param {string} excludeReservationId (Optional ID to ignore when summing for updates)
   * @returns {Object} Result structured { available: boolean, reason?: string, availableQty: number }
   */
  checkAvailability: function(resource, dateStr, timeSlot, requestedQty, excludeReservationId = null) {
    try {
      // 1. Check permanent restrictions
      this.checkRestrictions(resource.id, dateStr, timeSlot);
      
      // 2. Fetch all active reservations for this resource & date
      const existingRes = ReservationsRepo.getByResourceAndDate(resource.id, dateStr);
      
      // Filter out the slot we are checking, and optionally exclude the current reservation ID if updating
      const slotRes = existingRes.filter(r => r.timeSlot === timeSlot && r.id !== excludeReservationId);
      
      let reservedQty = 0;
      slotRes.forEach(r => {
        reservedQty += Number(r.quantity);
      });
      
      const capacityNum = Number(resource.capacity);
      const remainingQty = capacityNum - reservedQty;
      
      if (requestedQty > remainingQty) {
        if (remainingQty === 0) {
          return { available: false, reason: `El recurs està completament reservat per a aquesta franja horària.`, availableQty: 0 };
        } else {
          return { available: false, reason: `Només queden ${remainingQty} unitats disponibles. S'han sol·licitat ${requestedQty}.`, availableQty: remainingQty };
        }
      }
      
      return { available: true, availableQty: remainingQty };
      
    } catch (e) {
      return { available: false, reason: e.message, availableQty: 0 };
    }
  },

  /**
   * Public-facing availability check that fully validates parameters.
   * @param {Object} params { resourceId, date, timeSlot, quantity }
   */
  checkAvailabilityPublic: function(params) {
    AuthService.requireCanReserve(AuthService.getCurrentUserEmail());
    ValidationService.requireFields(params, ['resourceId', 'date', 'timeSlot', 'quantity']);
    ValidationService.validateTimeSlot(params.timeSlot);
    ValidationService.validateWeekday(params.date);
    
    const resource = ResourcesRepo.getById(params.resourceId);
    if (!resource || !ValidationService.parseActiveFlag(resource.active)) {
      throw new Error("Recurs no trobat o inactiu.");
    }
    
    ValidationService.validateResourceType(resource.type);
    ValidationService.validateQuantity(Number(params.quantity), resource);
    
    let finalQty = Number(params.quantity);
    if (resource.type === 'classroom' || resource.type === 'auditorium') {
      finalQty = Number(resource.capacity);
    }
    
    if(ReservationService.isExpired(params.date, params.timeSlot)) {
      return { available: false, reason: "La franja horària és en el passat.", availableQty: 0 };
    }
    
    return this.checkAvailability(resource, params.date, params.timeSlot, finalQty);
  }
};


// ==========================================
// RESERVATION SERVICE
// ==========================================

const ReservationService = {
  
  /**
   * Helper: Is the reservation in the past?
   * @param {string} dateStr (YYYY-MM-DD)
   * @param {string} timeSlot 
   * @returns {boolean}
   */
  isExpired: function(dateStr, timeSlot) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false; 
    
    // Use Apps Script local timezone logic
    // Create a local date for "now"
    const now = new Date();
    
    // Reconstruct the local time of the end slot for the target date
    const [year, month, day] = dateStr.split('-');
    const endHour = timeSlot.split('-')[1].split(':')[0]; // e.g. "11" from "10:00-11:00"
    const endMinute = timeSlot.split('-')[1].split(':')[1]; // e.g. "00"
    
    const resEndDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), parseInt(endHour, 10), parseInt(endMinute, 10), 0);
    
    return now > resEndDate;
  },

  /**
   * Reusable Lock wrapper to prevent race conditions during availability checks + writes.
   * @param {Function} criticalSection Callback function representing the transaction.
   * @returns {*} Result of the critical section
   */
  executeWithLock_: function(criticalSection) {
    const lock = LockService.getScriptLock();
    // Wait up to 10 seconds for other processes to release the lock
    const success = lock.tryLock(10000);
    
    if (!success) {
      throw new Error("El sistema està processant reserves mensuals o diàries. Siusplau, torna-ho a intentar.");
    }
    
    try {
      return criticalSection();
    } finally {
      lock.releaseLock();
    }
  },

  /**
   * Retrieves all active reservations for the current user.
   * @returns {Object[]}
   */
  listMyReservations: function() {
    const email = AuthService.getCurrentUserEmail();
    if (!email) throw new Error("No s'ha pogut determinar la identitat de l'usuari.");
    
    const allResources = ResourcesRepo.getAll();
    const resoMap = {};
    for (const res of allResources) {
      resoMap[res.id] = res.name;
    }
    
    return ReservationsRepo.getByUser(email).map(r => {
      // Add a dynamic field to tell the client if they can edit it
      r.isExpired = this.isExpired(r.date, r.timeSlot);
      r.resourceName = resoMap[r.resourceId] || 'Recurs Desconegut';
      return r;
    });
  },

  /**
   * Retrieves all active resources for users to browse.
   */
  listAvailableResources: function() {
    AuthService.requireCanReserve(AuthService.getCurrentUserEmail());
    const resources = ResourcesRepo.getAll();
    return resources.filter(r => ValidationService.parseActiveFlag(r.active));
  },
  
  /**
   * Retrieves a specific active resource by ID.
   */
  getResourceById: function(id) {
    AuthService.requireCanReserve(AuthService.getCurrentUserEmail());
    const resource = ResourcesRepo.getById(id);
    if (!resource || !ValidationService.parseActiveFlag(resource.active)) {
      throw new Error("Recurs no trobat o inactiu.");
    }
    return resource;
  },

  /**
   * Creates a new reservation.
   * @param {Object} params { resourceId, date, timeSlot, quantity }
   * @returns {Object} The created reservation object.
   */
  createReservation: function(params) {
    const userEmail = AuthService.getCurrentUserEmail();
    AuthService.requireCanReserve(userEmail);

    ValidationService.requireFields(params, ['resourceId', 'date', 'timeSlot', 'quantity', 'comment']);
    ValidationService.validateTimeSlot(params.timeSlot);
    ValidationService.validateWeekday(params.date);
    
    // Don't allow creating reservations in the past
    if(this.isExpired(params.date, params.timeSlot)) {
      throw new Error("No es poden crear reserves per a franges horàries passades.");
    }

    const resource = ResourcesRepo.getById(params.resourceId);
    if (!resource || !ValidationService.parseActiveFlag(resource.active)) {
      throw new Error("Recurs no trobat o inactiu.");
    }

    ValidationService.validateResourceType(resource.type);

    ValidationService.validateQuantity(Number(params.quantity), resource);

    // Spaces (classrooms/auditoriums) must be fully reserved. Force quantity to match capacity.
    let finalQty = Number(params.quantity);
    if (resource.type === 'classroom' || resource.type === 'auditorium') {
      finalQty = Number(resource.capacity);
    }

    // Entering concurrency-safe section
    return ReservationService.executeWithLock_(function() {
      const availResult = AvailabilityService.checkAvailability(
        resource, params.date, params.timeSlot, finalQty
      );
      
      if (!availResult.available) {
        throw new Error(availResult.reason);
      }
      
      return ReservationsRepo.create({
        resourceId: resource.id,
        userEmail: userEmail,
        date: params.date,
        timeSlot: params.timeSlot,
        quantity: finalQty,
        status: 'active',
        comment: params.comment
      });
    });
  },

  /**
   * Updates an existing reservation.
   * @param {string} reservationId 
   * @param {Object} params { date, timeSlot, quantity }
   */
  updateReservation: function(reservationId, params) {
    const userEmail = AuthService.getCurrentUserEmail();
    const isAdmin = AuthService.isAdmin(userEmail);
    
    const existing = ReservationsRepo.getById(reservationId);
    if (!existing || existing.status === 'deleted') throw new Error("Reserva no trobada.");

    // Explicit Authorization Rule: Users can modify or cancel only their own reservations.
    // Admins may override and modify any reservation.
    if (existing.userEmail !== userEmail && !isAdmin) {
      throw new Error("Error d'autorització: Només pots modificar les teves reserves.");
    }

    // Past rule: Cannot modify past reservations
    if (this.isExpired(existing.date, existing.timeSlot)) {
      throw new Error("No es poden modificar reserves passades.");
    }

    // Apply validations against params if they are provided
    // Forbid changing the resourceId during an update to prevent complex capacity shifting bugs.
    if (params.resourceId && params.resourceId !== existing.resourceId) {
      throw new Error("No es pot canviar el recurs d'una reserva existent. Siusplau, cancel·la i crea'n una de nova.");
    }

    const updateTarget = { ...existing, ...params }; // Merge logic to validate the proposed final state
    
    ValidationService.requireFields(updateTarget, ['resourceId', 'date', 'timeSlot', 'quantity', 'comment']);
    ValidationService.validateTimeSlot(updateTarget.timeSlot);
    ValidationService.validateWeekday(updateTarget.date);
    
    if(ReservationService.isExpired(updateTarget.date, updateTarget.timeSlot)) {
      throw new Error("No es pot actualitzar una reserva a una franja horària ja passada.");
    }

    const resource = ResourcesRepo.getById(updateTarget.resourceId);
    if (!resource || !ValidationService.parseActiveFlag(resource.active)) {
      throw new Error("Recurs no trobat o inactiu.");
    }
    
    ValidationService.validateResourceType(resource.type);
    ValidationService.validateQuantity(Number(updateTarget.quantity), resource);
    
    let finalQty = Number(updateTarget.quantity);
    if (resource.type === 'classroom' || resource.type === 'auditorium') {
      finalQty = Number(resource.capacity);
    }
    updateTarget.quantity = finalQty;

    // Concurrency safe section
    return ReservationService.executeWithLock_(function() {
      const availResult = AvailabilityService.checkAvailability(
        resource, updateTarget.date, updateTarget.timeSlot, finalQty, reservationId
      );
      
      if (!availResult.available) {
        throw new Error(availResult.reason);
      }
      
      return ReservationsRepo.update(reservationId, {
        date: updateTarget.date,
        timeSlot: updateTarget.timeSlot,
        quantity: updateTarget.quantity,
        comment: updateTarget.comment
      });
    });
  },

  /**
   * Cancels (soft deletes) a reservation.
   * @param {string} reservationId 
   */
  cancelReservation: function(reservationId) {
    const userEmail = AuthService.getCurrentUserEmail();
    const isAdmin = AuthService.isAdmin(userEmail);
    
    const existing = ReservationsRepo.getById(reservationId);
    if (!existing || existing.status === 'deleted') throw new Error("Reserva no trobada.");

    // Explicit Authorization Rule: Users can modify or cancel only their own reservations.
    // Admins may override and cancel any reservation.
    if (existing.userEmail !== userEmail && !isAdmin) {
      throw new Error("Error d'autorització: Només pots cancel·lar les teves reserves.");
    }

    if (this.isExpired(existing.date, existing.timeSlot)) {
      throw new Error("No es pot cancel·lar una reserva passada.");
    }

    // Minor concurrency protection: prevent cancelling while another request might be updating it simultaneously
    return ReservationService.executeWithLock_(function() {
      return ReservationsRepo.delete(reservationId);
    });
  }
};

// ==========================================
// ADMIN SERVICE
// ==========================================

const AdminService = {

  // -- RESOURCES --

  listResources: function() {
    AuthService.requireAdmin(AuthService.getCurrentUserEmail());
    return ResourcesRepo.getAll();
  },

  createResource: function(params) {
    AuthService.requireAdmin(AuthService.getCurrentUserEmail());
    ValidationService.requireFields(params, ['name', 'type', 'capacity']);
    ValidationService.validateResourceType(params.type);

    // Default active status to true
    if (params.active === undefined) params.active = true;

    return ResourcesRepo.create(params);
  },

  updateResource: function(id, params) {
    AuthService.requireAdmin(AuthService.getCurrentUserEmail());
    if (params.type) ValidationService.validateResourceType(params.type);

    return ResourcesRepo.update(id, params);
  },

  deleteResource: function(id) {
    AuthService.requireAdmin(AuthService.getCurrentUserEmail());

    // Replaced hard delete with soft deactivation to prevent orphaned reservations
    ResourcesRepo.update(id, { active: false });
    return true; 
  },

  // -- RESTRICTIONS --

  listRestrictions: function() {
    AuthService.requireAdmin(AuthService.getCurrentUserEmail());
    return RestrictionsRepo.getAll();
  },

  /**
   * Internal helper to create a single restriction record per slot.
   */
  createSingleRestriction_: function(params) {
    ValidationService.requireFields(params, ['resourceId', 'dayOfWeek', 'timeSlot']);
    ValidationService.validateTimeSlot(params.timeSlot);

    const resource = ResourcesRepo.getById(params.resourceId);
    if (!resource) throw new Error("Recurs no trobat.");
    if (!ValidationService.parseActiveFlag(resource.active)) {
      throw new Error("No es poden crear restriccions per a un recurs inactiu.");
    }

    return RestrictionsRepo.create(params);
  },

  /**
   * Creates a restriction. Supports creating multiple records if `timeSlots` array is provided,
   * or a single record if `timeSlot` string is provided.
   */
  createRestriction: function(params) {
    AuthService.requireAdmin(AuthService.getCurrentUserEmail());
    
    // Convenience handling for multiple slots at once from admin UI
    if (params.timeSlots && Array.isArray(params.timeSlots)) {
      const created = [];
      for (const slot of params.timeSlots) {
        created.push(this.createSingleRestriction_({
          resourceId: params.resourceId,
          dayOfWeek: params.dayOfWeek,
          timeSlot: slot,
          description: params.description
        }));
      }
      return created; // Returns array of new restriction objects
    } else {
      // Single slot flow
      return this.createSingleRestriction_(params);
    }
  },

  updateRestriction: function(id, params) {
    AuthService.requireAdmin(AuthService.getCurrentUserEmail());
    const existing = RestrictionsRepo.getById(id);
    if (!existing) throw new Error("Restricció no trobada.");

    if (params.timeSlot) ValidationService.validateTimeSlot(params.timeSlot);

    const resourceIdToCheck = params.resourceId || existing.resourceId;
    const resource = ResourcesRepo.getById(resourceIdToCheck);
    if (!resource || !ValidationService.parseActiveFlag(resource.active)) {
       throw new Error("No es poden editar restriccions per a un recurs inactiu.");
    }

    return RestrictionsRepo.update(id, params);
  },

  deleteRestriction: function(id) {
    AuthService.requireAdmin(AuthService.getCurrentUserEmail());
    RestrictionsRepo.delete(id);
    return true;
  }
};
