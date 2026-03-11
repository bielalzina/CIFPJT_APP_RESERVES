/**
 * src/Setup.gs
 * Setup and bootstrap utilities for the Reservation System.
 * Run `setupSystem` from the Apps Script editor to initialize the active spreadsheet 
 * with the required sheets and headers based on CONFIG.
 */

function setupSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  if (!ss) {
    throw new Error('No active spreadsheet found. Please run this script while it is bound to a Google Sheet.');
  }
  
  const sheetNames = Object.values(CONFIG.SHEETS);
  
  sheetNames.forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    
    // Create sheet if it doesn't exist
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      Logger.log('Created new sheet: ' + sheetName);
    }
    
    // Set headers
    // Use the uppercase sheet name as key in SCHEMAS map
    const headers = CONFIG.SCHEMAS[sheetName.toUpperCase()];
    if (headers && headers.length > 0) {
      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setValues([headers]);
      headerRange.setFontWeight('bold');
      
      // Freeze the top row for better visibility
      sheet.setFrozenRows(1);
      
      Logger.log('Set headers for sheet: ' + sheetName);
    }
  });
  
  Logger.log('System setup completed successfully.');
}
