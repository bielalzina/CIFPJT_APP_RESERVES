/**
 * src/Code.gs
 * Application Entry Point for the Reservation System.
 */

/**
 * Handle HTTP GET requests.
 * Required to deploy as a Web App.
 * 
 * @param {Object} e Event object
 * @returns {HtmlOutput} The evaluated Index.html
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Reservation System')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Standard utility to include separate HTML files (like CSS/JS) into the main template.
 * @param {string} filename 
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Gets the current active user's email.
 * Centralized utility function to derive identity.
 * Note: Session.getActiveUser().getEmail() may return an empty value 
 * depending on Google Workspace deployment mode and domain settings.
 * Full identity handling will need to address these cases.
 * 
 * @returns {string} The email address of the active user.
 */
function getCurrentUserEmail() {
  return Session.getActiveUser().getEmail();
}
