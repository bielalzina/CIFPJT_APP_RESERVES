/**
 * src/Controllers.gs
 * API Layer to handle requests originating from the client via google.script.run.
 * Each endpoint enforces safe exception handling and standardizes the response.
 */

// ==========================================
// RESPONSE WRAPPERS & HELPERS
// ==========================================

/**
 * Standardizes the backend response object for the client.
 * @param {boolean} success 
 * @param {string} message 
 * @param {*} data 
 * @returns {string} JSON stringified response payload.
 */
function apiResponse_(success, message, data = null) {
  return JSON.stringify({
    success: success,
    message: message,
    data: data
  });
}

/**
 * Higher-order function to wrap controller logic with error catching.
 * Converts Server Errors to safe client responses.
 * @param {Function} callback Service execution block.
 * @returns {string} standard API response payload.
 */
function withErrorHandling_(callback) {
  try {
    const data = callback();
    return apiResponse_(true, "Success", data || null);
  } catch (error) {
    // We log the detailed stack trace server-side for internal debugging
    console.error("Controller Error: " + error.message, error.stack);
    
    // Return a safe string message to the client 
    // If the error appears to be a generic system error (e.g. ReferenceError, TypeError) 
    // rather than our explicit string errors (e.g., "Validation failed: ..."), sanitize it.
    let safeMessage = error.message;
    if (error.name === 'TypeError' || error.name === 'ReferenceError' || error.name === 'SyntaxError') {
      safeMessage = "S'ha produït un error intern inesperat. Siusplau, contacta amb l'administrador.";
    }
    
    return apiResponse_(false, safeMessage);
  }
}

// ==========================================
// USER & AUTHENTICATION ENDPOINTS
// ==========================================

/**
 * Endpoint: getCurrentUserInfo()
 * Evaluates the accessing user's identity and permissions.
 */
function getCurrentUserInfo() {
  return withErrorHandling_(function() {
    const email = AuthService.getCurrentUserEmail();
    const user = AuthService.getUserRecord(email);
    
    return {
      email: email,
      role: user ? user.role : null,
      isActive: user ? ValidationService.parseActiveFlag(user.active) : false,
      canReserve: AuthService.canReserve(email),
      isAdmin: AuthService.isAdmin(email)
    };
  });
}

function listReservableResources() {
  return withErrorHandling_(function() {
    return ReservationService.listAvailableResources();
  });
}

function getResourceById(id) {
  return withErrorHandling_(function() {
    return ReservationService.getResourceById(id);
  });
}

function getAvailability(params) {
  return withErrorHandling_(function() {
    return AvailabilityService.checkAvailabilityPublic(params);
  });
}


// ==========================================
// RESERVATION ENDPOINTS (Teachers & Admins)
// ==========================================

function listMyReservations() {
  return withErrorHandling_(function() {
    return ReservationService.listMyReservations();
  });
}

function createReservation(params) {
  return withErrorHandling_(function() {
    return ReservationService.createReservation(params);
  });
}

function updateReservation(id, params) {
  return withErrorHandling_(function() {
    return ReservationService.updateReservation(id, params);
  });
}

function cancelReservation(id) {
  return withErrorHandling_(function() {
    ReservationService.cancelReservation(id);
    return true;
  });
}


// ==========================================
// ADMIN ENDPOINTS
// ==========================================

function adminListResources() {
  return withErrorHandling_(function() {
    return AdminService.listResources();
  });
}

function adminCreateResource(params) {
  return withErrorHandling_(function() {
    return AdminService.createResource(params);
  });
}

function adminUpdateResource(id, params) {
  return withErrorHandling_(function() {
    return AdminService.updateResource(id, params);
  });
}

function adminDeleteResource(id) {
  return withErrorHandling_(function() {
    return AdminService.deleteResource(id);
  });
}

function adminListRestrictions() {
  return withErrorHandling_(function() {
    return AdminService.listRestrictions();
  });
}

function adminCreateRestriction(params) {
  return withErrorHandling_(function() {
    return AdminService.createRestriction(params);
  });
}

function adminUpdateRestriction(id, params) {
  return withErrorHandling_(function() {
    return AdminService.updateRestriction(id, params);
  });
}

function adminDeleteRestriction(id) {
  return withErrorHandling_(function() {
    return AdminService.deleteRestriction(id);
  });
}
