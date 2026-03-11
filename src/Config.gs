/**
 * src/Config.gs
 * Centralized configuration for the Reservation System CIFPJT
 * Defines sheet names, time slots, roles, and schema requirements.
 */

const CONFIG = {
  SHEETS: {
    RESOURCES: 'Resources',
    RESERVATIONS: 'Reservations',
    RESTRICTIONS: 'Restrictions'
  },
  
  GROUPS: {
    ADMIN: 'admin.users@cifpjoantaix.cat',
    TEACHER: 'professorat@cifpjoantaix.cat'
  },
  
  // Allowed resource types: 'classroom', 'auditorium', 'laptop_cart'
  
  TIME_SLOTS: [
    '08:00-09:00',
    '09:00-10:00',
    '10:00-11:00',
    '11:00-12:00',
    '12:00-13:00',
    '13:00-14:00',
    '14:00-15:00'
  ],
  
  ROLES: {
    ADMIN: 'admin',
    TEACHER: 'teacher'
  },
  
  SCHEMAS: {
    RESOURCES: [
      'id', 
      'name', 
      'type', 
      'capacity', 
      'active'
    ],
    RESERVATIONS: [
      'id', 
      'resourceId', 
      'userEmail', 
      'date', 
      'timeSlot', 
      'quantity', 
      'status', 
      'comment',
      'createdAt', 
      'updatedAt'
    ],
    RESTRICTIONS: [
      'id', 
      'resourceId', 
      'dayOfWeek', 
      'timeSlot', 
      'description'
    ]
  }
};
