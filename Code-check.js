/*******************************************************
 * SUPER EL NIÑO — HEAT-RELATED ILLNESS SURVEILLANCE
 * Google Apps Script / Code.gs — V48 TEST: Dynamic Conditions + Hospital Referrals
 *
 * PURPOSE
 * - Creates the full Google Sheets database structure.
 * - Server-side role and barangay restrictions.
 * - Patient records + offline sync/idempotency.
 * - Admin/BHW users + contact details.
 * - Announcements for Public/Admin/BHW.
 * - Medical inventory per barangay.
 * - BHW online/offline heartbeat monitoring.
 * - Heat Index storage + official PAGASA source reference.
 *
 * FIRST RUN
 * 1. Open a NEW Google Sheet.
 * 2. Extensions > Apps Script.
 * 3. Replace Code.gs with this file.
 * 4. Save.
 * 5. Run INITIALIZE_SYSTEM once.
 * 6. Approve permissions.
 * 7. Deploy as Web app:
 *      Execute as: Me
 *      Who has access: Anyone with the link
 *
 * INITIAL DEMO ADMIN
 *   Username: admin
 *   Password: admin123
 * Change this password immediately in production.
 *
 * IMPORTANT
 * - This script does NOT migrate prototype/localStorage data.
 * - Running INITIALIZE_SYSTEM on a new sheet creates clean live tables.
 * - Heat Index is NOT fabricated. The HeatIndex sheet is ready for
 *   official/authorized PAGASA/iHeatMap values. The script also has a
 *   PAGASA AWS reference connector for Tanay, Rizal.
 ********************************************************/

const APP = {
  VERSION: 'V48-TEST-PATIENT-LAB-ATTACHMENTS',
  NAME: 'SUPER EL NIÑO',
  CITY: 'Antipolo City',
  TIMEZONE: 'Asia/Manila',

  SHEETS: {
    USERS: 'Users',
    BARANGAYS: 'Barangays',
    PATIENTS: 'PatientRecords',
    ANNOUNCEMENTS: 'Announcements',
    INVENTORY: 'Inventory',
    INVENTORY_TRANSACTIONS: 'InventoryTransactions',
    INVENTORY_RELEASES: 'InventoryReleases',
    CONNECTIVITY: 'Connectivity',
    HEAT: 'HeatIndex',
    AUDIT: 'AuditLogs',
    SETTINGS: 'SystemSettings',
    SYNC: 'SyncQueue',
    FACILITY_REPORTS: 'HealthFacilityReports',
    FACILITY_REPORT_HISTORY: 'HealthFacilityReportHistory',
    CONDITIONS: 'ConditionCatalog',
    HOSPITALS: 'Hospitals',
    REFERRALS: 'HospitalReferrals',
    REFERRAL_HISTORY: 'HospitalReferralHistory',
    PATIENT_ATTACHMENTS: 'PatientAttachments',
    AUTH_SESSIONS: 'AuthSessions'
  },

  PAGASA: {
    HEAT_URL: 'https://src.panahon.gov.ph/pubfiles/cad/iaas/ihif_new',
    AWS_URL: 'https://bagong.pagasa.dost.gov.ph/automated-weather-station',
    IHEATMAP_URL: 'https://www.pagasa.dost.gov.ph/weather/heat-index'
  },

  ONLINE_MINUTES: 10,
  PENDING_MINUTES: 30,

  BARANGAYS: [
    'Bagong Nayon',
    'Beverly Hills',
    'Calawis',
    'Cupang',
    'Dalig',
    'Dela Paz',
    'Inarawan',
    'Mambugan',
    'Mayamot',
    'Muntindilaw',
    'San Isidro',
    'San Jose',
    'San Juan',
    'San Luis',
    'San Roque',
    'Santa Cruz'
  ]
};

const HEADERS = {
  Users: [
    'User_ID','Full_Name','Role','Username','Password_Hash',
    'Barangay','Contact_Number','Photo_File_ID','Photo_URL','Photo_Data',
    'Status','Last_Seen','Device_ID','Created_At','Updated_At','Hospital_ID','Must_Change_Password'
  ],

  Barangays: [
    'Barangay','Active','BHW_User_ID','BHW_Name','BHW_Contact','Updated_At'
  ],

  PatientRecords: [
    'Report_ID','Client_Event_ID','Date_Time','Patient_Name','Age','Sex',
    'Age_Group','Barangay','Condition','Contact_Number','Blood_Pressure','Temperature_C','Heart_Rate','Respiratory_Rate','Oxygen_Saturation','GCS','Chief_Complaint','Working_Diagnosis',
    'Disposition','Notes','Critical','Status','Created_By','Created_By_Role',
    'Device_ID','Sync_Status','Created_At','Updated_At','Condition_ID'
  ],

  Announcements: [
    'Announcement_ID','Type','Priority','Title','Barangay','Body',
    'Valid_Until','Published_At','Active','Created_By','Created_By_Role',
    'Updated_At'
  ],

  Inventory: [
    'Inventory_ID','Barangay','Category','Item_Name','Unit',
    'Current_Stock','Reorder_Level','Released','Updated_By','Updated_At'
  ],

  InventoryTransactions: [
    'Transaction_ID','Timestamp','Inventory_ID','Item_Name','From_Location',
    'To_Barangay','Quantity','Unit','Performed_By','Notes'
  ],

  InventoryReleases: [
    'Release_ID','Timestamp','Inventory_ID','Barangay','Item_Name','Quantity',
    'Unit','Patient_Name','Patient_Report_ID','Reason','Performed_By','Notes'
  ],

  Connectivity: [
    'User_ID','Full_Name','Role','Barangay','Device_ID',
    'Status','Last_Seen','Updated_At'
  ],

  HeatIndex: [
    'Heat_ID','Barangay','Heat_Index_C','Risk_Level',
    'Source','Source_URL','Reference_Station','Observed_At',
    'Updated_At','Is_Live','Notes'
  ],

  AuditLogs: [
    'Log_ID','Timestamp','User_ID','Username','Role',
    'Action','Entity','Entity_ID','Details'
  ],

  SystemSettings: [
    'Setting','Value','Description','Updated_At'
  ],

  SyncQueue: [
    'Queue_ID','Action','Entity','Entity_ID','Payload_JSON',
    'Status','Attempts','Created_At','Processed_At','Error'
  ],

  HealthFacilityReports: [
    'Report_ID','Client_Event_ID','Barangay','Facility_Name','Category','Priority',
    'Title','Description','Reporting_BHW_ID','Reporting_BHW_Name',
    'Reporting_BHW_Username','Submitted_At','Status','Admin_Remarks',
    'Acknowledged_At','In_Progress_At','Resolved_At','Updated_At'
  ],

  HealthFacilityReportHistory: [
    'History_ID','Report_ID','Action','From_Status','To_Status','Remarks',
    'Changed_By_User_ID','Changed_By_Username','Changed_By_Role','Changed_At'
  ],

  ConditionCatalog: [
    'Condition_ID','Name','Active','Created_At','Updated_At','Created_By_User_ID','Updated_By_User_ID'
  ],

  Hospitals: [
    'Hospital_ID','Hospital_Name','Short_Name','ER_Capacity','ER_Available',
    'Ward_Capacity','Ward_Available','Active','Updated_By_User_ID','Updated_At'
  ],

  HospitalReferrals: [
    'Referral_ID','Client_Event_ID','Report_ID','Patient_Name','Age','Age_Group','Sex','Barangay',
    'Condition','Condition_ID','Contact_Number','Date_Time','Blood_Pressure','Temperature_C',
    'Heart_Rate','Respiratory_Rate','Oxygen_Saturation','GCS','Chief_Complaint','Working_Diagnosis',
    'Disposition','Notes','Referral_Reason','Hospital_ID','Hospital_Name','Referral_Status',
    'Sent_By_User_ID','Sent_By_Username','Sent_At','Receiving_Personnel','Response_Remarks',
    'Responded_At','Updated_At'
  ],

  HospitalReferralHistory: [
    'History_ID','Referral_ID','Report_ID','Hospital_ID','Action','From_Status','To_Status',
    'Receiving_Personnel','Remarks','Changed_By_User_ID','Changed_By_Username','Changed_By_Role','Changed_At'
  ],

  PatientAttachments: [
    'Attachment_ID','Client_Event_ID','Report_ID','File_ID','File_URL','File_Name','Mime_Type','Size_Bytes',
    'Uploaded_By_User_ID','Uploaded_By_Username','Uploaded_By_Role','Uploaded_At','Active'
  ],

  AuthSessions: [
    'Session_ID','User_ID','Token_Hash','Created_At','Expires_At','Last_Used_At','Revoked','Device_ID'
  ]
};


/* ======================================================
   REQUEST-LOCAL PERFORMANCE CONTEXT
   ====================================================== */

// Apps Script web requests often call several server functions in one execution.
// Keep Spreadsheet/Sheet/User objects only for the lifetime of that request.
// This prevents repeated openById()/getSheetByName()/Users reads without keeping
// stale authorization data between separate web requests.
let REQUEST_DB_SS_ = null;
let REQUEST_SHEETS_ = Object.create(null);
let REQUEST_AUTH_ = Object.create(null);

function resetRequestContext_() {
  REQUEST_DB_SS_ = null;
  REQUEST_SHEETS_ = Object.create(null);
  REQUEST_AUTH_ = Object.create(null);
}

/* ======================================================
   WEB APP
   ====================================================== */

function doGet(e) {
  resetRequestContext_();
  try {
    const action = e && e.parameter ? String(e.parameter.action || '') : '';

    // Ultra-light runtime warm-up endpoint used by the frontend before login.
    // It intentionally avoids opening Google Sheets or calling external APIs.
    if (action === 'ping') {
      return json_({ok:true,pong:true,timestamp:now_()});
    }

    if (action === 'health') {
      const ss = getDatabaseSpreadsheet_();
      return json_({
        ok: true,
        app: APP.NAME,
        version: APP.VERSION,
        city: APP.CITY,
        spreadsheetConfigured: !!ss,
        requiredSheets: Object.keys(HEADERS).map(function(k){ return APP.SHEETS[k] || k; }).filter(function(name){ return !!ss.getSheetByName(name); }),
        timestamp: now_()
      });
    }

    try {
      return HtmlService
        .createTemplateFromFile('Index')
        .evaluate()
        .setTitle(APP.NAME + ' — Heat-Related Illness Surveillance')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch (err) {
      return json_({
        ok: true,
        message: 'Backend is ready. Add Index.html to serve the dashboard.',
        app: APP.NAME,
        city: APP.CITY,
        timestamp: now_()
      });
    }
  } finally {
    resetRequestContext_();
  }
}

function doPost(e) {
  resetRequestContext_();
  try {
    const body = parseRequestBody_(e);
    return json_(routeAction_(body));
  } catch (err) {
    return json_({
      ok: false,
      error: safeError_(err)
    });
  } finally {
    resetRequestContext_();
  }
}

/* Optional Apps Script HTMLService bridge */
function api(request) {
  resetRequestContext_();
  try {
    return routeAction_(request || {});
  } catch (err) {
    return {
      ok: false,
      error: safeError_(err)
    };
  } finally {
    resetRequestContext_();
  }
}

function routeAction_(r) {
  const action = String(r.action || '').trim();

  switch (action) {
    case 'login': return login_(r);
    case 'logout': return logout_(r);

    case 'dashboard': return getDashboard_(r);
    case 'publicAnnouncements': return getPublicAnnouncements_();
    case 'announcementDiagnostics': return getAnnouncementDiagnostics_(r);
    case 'personnel': return getPersonnel_(r);
    case 'users': return listUsers_(r);
    case 'bhwRegistrationSummary': return getBhwRegistrationSummary_(r);
    case 'conditions': return getConditions_(r);
    case 'publicConditions': return getPublicConditions_();
    case 'publicBranding': return getPublicBranding_(r);
    case 'savePublicBranding': return savePublicBranding_(r);
    case 'saveCondition': return saveCondition_(r);
    case 'publicHospitals': return getPublicHospitals_();
    case 'adminHospitals': return getAdminHospitals_(r);
    case 'saveHospitalCapacity': return saveHospitalCapacity_(r);
    case 'hospitalDashboard': return getHospitalDashboard_(r);
    case 'updateHospitalBeds': return updateHospitalBeds_(r);
    case 'hospitalReferrals': return getHospitalReferrals_(r);
    case 'hospitalReferralSummary': return getHospitalReferralSummary_(r);
    case 'sendHospitalReferral': return sendHospitalReferral_(r);
    case 'respondHospitalReferral': return respondHospitalReferral_(r);
    case 'changePassword': return changeHospitalPassword_(r);

    case 'saveUser': return saveUser_(r);
    case 'deleteUser': return deleteUser_(r);

    case 'patients': return listPatients_(r);
    case 'savePatient': return savePatient_(r);
    case 'syncReports': return syncReports_(r);
    case 'deletePatient': return deletePatient_(r);
    case 'uploadPatientAttachment': return uploadPatientAttachment_(r);
    case 'patientAttachments': return listPatientAttachments_(r);
    case 'patientAttachmentData': return getPatientAttachmentData_(r);

    case 'announcements': return getAnnouncements_(r);
    case 'saveAnnouncement': return saveAnnouncement_(r);
    case 'deleteAnnouncement': return deleteAnnouncement_(r);

    case 'healthFacilityReports': return getHealthFacilityReports_(r);
    case 'healthFacilityReportSummary': return getHealthFacilityReportSummary_(r);
    case 'saveHealthFacilityReport': return saveHealthFacilityReport_(r);
    case 'updateHealthFacilityReport': return updateHealthFacilityReport_(r);

    case 'inventory': return getInventory_(r);
    case 'saveInventory': return saveInventory_(r);
    case 'deleteInventory': return deleteInventory_(r);
    case 'distributeInventory': return distributeInventory_(r);
    case 'releaseInventory': return releaseInventory_(r);

    case 'heartbeat': return heartbeat_(r);
    case 'connectivity': return getConnectivity_(r);

    case 'heatIndex': return getHeatIndex_(r);
    case 'refreshHeatReference': return refreshPAGASAAWSReference_(r);
    case 'saveHeatIndex': return saveHeatIndex_(r);

    case 'uploadPhoto': return uploadPhoto_(r);

    default:
      return {ok:false, error:'Unknown action: ' + action};
  }
}


/* ======================================================
   INITIAL SETUP
   ====================================================== */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🌡️ Super El Niño')
    .addItem('Initialize / Verify System', 'INITIALIZE_SYSTEM')
    .addItem('Reset Live Data Tables', 'RESET_LIVE_DATA')
    .addItem('Reset BHW Presence', 'RESET_BHW_PRESENCE')
    .addItem('Clean Exact Duplicate Inventory', 'CLEAN_DUPLICATE_CENTRAL_INVENTORY')
    .addSeparator()
    .addItem('Refresh PAGASA Reference', 'refreshPAGASAAWSReference_MENU')
    .addItem('Install / Refresh Triggers', 'INSTALL_TRIGGERS')
    .addToUi();
}

function getDatabaseSpreadsheet_() {
  if (REQUEST_DB_SS_) return REQUEST_DB_SS_;

  const props = PropertiesService.getScriptProperties();
  const id = String(props.getProperty('SPREADSHEET_ID') || '').trim();
  if (id) {
    try {
      REQUEST_DB_SS_ = SpreadsheetApp.openById(id);
      return REQUEST_DB_SS_;
    } catch (err) {
      throw new Error('Configured database spreadsheet could not be opened: ' + safeError_(err));
    }
  }

  const active = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.getActive();
  if (!active) {
    throw new Error('Database spreadsheet is not configured. Open the live Google Sheet and run INITIALIZE_SYSTEM once.');
  }
  props.setProperty('SPREADSHEET_ID', active.getId());
  REQUEST_DB_SS_ = active;
  return REQUEST_DB_SS_;
}

function INITIALIZE_SYSTEM() {
  const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.getActive();
  if (!ss) throw new Error('Open the Google Sheet that will serve as the live database, then run INITIALIZE_SYSTEM.');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());

  Object.keys(HEADERS).forEach(function(sheetKey) {
    const name = APP.SHEETS[sheetKey] || sheetKey;
    ensureSheet_(ss, name, HEADERS[sheetKey]);
  });

  seedBarangays_();
  seedSettings_();
  seedInitialAdmin_();
  seedHospitalFeatureData_();
  seedHeatIndexRows_();
  formatAllSheets_();
  installTriggers_();

  SpreadsheetApp.getUi().alert(
    'Super El Niño system initialized successfully.\n\n' +
    'Sheets and columns were created/verified.\n' +
    'Initial Admin: admin / admin123\n\n' +
    'Change the Admin password before production use.'
  );
}


/**
 * Additive, non-destructive migration for dynamic conditions and hospital referrals.
 * Run once from the bound TEST Apps Script project after saving this code.
 * This does not clear or reset any existing table.
 */
function MIGRATE_HOSPITAL_FEATURES() {
  const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.getActive();
  if (!ss) throw new Error('Open the target test Google Sheet before running this migration.');
  // Use the spreadsheet that is visibly bound to this test project for this
  // execution. Avoid an unnecessary openById() round-trip during migration.
  resetRequestContext_();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  REQUEST_DB_SS_ = ss;
  ensureHeaderColumnsAppend_(ensureSheet_(ss, APP.SHEETS.USERS, HEADERS.Users), HEADERS.Users);
  ensureHeaderColumnsAppend_(ensureSheet_(ss, APP.SHEETS.PATIENTS, HEADERS.PatientRecords), HEADERS.PatientRecords);
  Object.keys({
    HealthFacilityReports: HEADERS.HealthFacilityReports,
    HealthFacilityReportHistory: HEADERS.HealthFacilityReportHistory,
    ConditionCatalog: HEADERS.ConditionCatalog,
    Hospitals: HEADERS.Hospitals,
    HospitalReferrals: HEADERS.HospitalReferrals,
    HospitalReferralHistory: HEADERS.HospitalReferralHistory,
    PatientAttachments: HEADERS.PatientAttachments,
    AuthSessions: HEADERS.AuthSessions
  }).forEach(function(key) {
    const name = APP.SHEETS[key] || key;
    const sh = ensureSheet_(ss, name, HEADERS[key]);
    ensureHeaderColumnsAppend_(sh, HEADERS[key]);
  });
  // Repair only the patient/referral header rows in-place, preserving all existing cell data.
  repairPatientReferralHeaderRows_(ss);
  seedHospitalFeatureData_();
  backfillPatientConditionIds_();
  synchronizeAllReferralSnapshots_(ss);
  // Formatting is cosmetic. A transient Sheets service error while formatting
  // must not mark a successful data migration as failed.
  formatFeatureSheets_(ss);
  try { SpreadsheetApp.flush(); } catch (flushErr) { Logger.log('Non-fatal flush warning after migration: ' + safeError_(flushErr)); }
  Logger.log('Hospital / dynamic condition migration completed. Existing records were retained; patient/referral schemas were repaired and referral snapshots refreshed.');
}

/**
 * Additive migration for optional private patient/laboratory photo attachments.
 * Run once in the bound TEST project after replacing Code.gs.
 * Creates a private Drive folder and metadata sheet; does not change patient rows.
 */
function MIGRATE_PATIENT_ATTACHMENTS() {
  const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.getActive();
  if (!ss) throw new Error('Open the target TEST Google Sheet before running this migration.');
  resetRequestContext_();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  REQUEST_DB_SS_ = ss;
  const sheet = ensureSheet_(ss, APP.SHEETS.PATIENT_ATTACHMENTS, HEADERS.PatientAttachments);
  ensureHeaderColumnsAppend_(sheet, HEADERS.PatientAttachments);
  const folder = getOrCreatePatientAttachmentsFolder_();
  SpreadsheetApp.flush();
  Logger.log('Patient attachment migration ready. Metadata sheet: ' + sheet.getName() + '; private folder ID: ' + folder.getId());
  return {ok:true, sheet:sheet.getName(), folderReady:true};
}

/**
 * Fixes blank/duplicate column labels in the two synchronized clinical tables.
 * Does not move or clear patient rows. For duplicate labels, the right-most copy
 * remains canonical because the previous row mapper resolved duplicates that way;
 * earlier duplicate columns are renamed Legacy_Duplicate_* so their values survive.
 */
function repairPatientReferralHeaderRows_(ss) {
  ss = ss || getDatabaseSpreadsheet_();
  const patientSheet = ss.getSheetByName(APP.SHEETS.PATIENTS) || ensureSheet_(ss, APP.SHEETS.PATIENTS, HEADERS.PatientRecords);
  const referralSheet = ss.getSheetByName(APP.SHEETS.REFERRALS) || ensureSheet_(ss, APP.SHEETS.REFERRALS, HEADERS.HospitalReferrals);
  repairHeaderRowPreservingData_(patientSheet, HEADERS.PatientRecords);
  repairHeaderRowPreservingData_(referralSheet, HEADERS.HospitalReferrals);
}

function repairHeaderRowPreservingData_(sheet, expectedHeaders) {
  const lastCol = sheet.getLastColumn();
  let headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(v => String(v || '').trim()) : [];
  if (!headers.length || !headers.some(Boolean)) {
    headers = expectedHeaders.slice();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }
  const seen = Object.create(null);
  // Walk right-to-left so existing getData_ duplicate resolution (last matching header) stays consistent.
  for (let i = headers.length - 1; i >= 0; i--) {
    let h = headers[i];
    if (!h) h = 'Legacy_Column_' + (i + 1);
    if (seen[h]) {
      const original = h;
      h = 'Legacy_Duplicate_' + original.replace(/[^A-Za-z0-9_]+/g, '_') + '_Col' + (i + 1);
      let suffix = 2;
      while (seen[h]) { h = 'Legacy_Duplicate_' + original.replace(/[^A-Za-z0-9_]+/g, '_') + '_Col' + (i + 1) + '_' + suffix++; }
    }
    headers[i] = h;
    seen[h] = true;
  }
  expectedHeaders.forEach(function(h) {
    if (!seen[h]) { headers.push(h); seen[h] = true; }
  });
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
}

function synchronizeAllReferralSnapshots_(ss) {
  ss = ss || getDatabaseSpreadsheet_();
  const patientSheet = ss.getSheetByName(APP.SHEETS.PATIENTS);
  const referralSheet = ss.getSheetByName(APP.SHEETS.REFERRALS);
  if (!patientSheet || !referralSheet || patientSheet.getLastRow() < 2 || referralSheet.getLastRow() < 2) return 0;
  const pd = getData_(patientSheet);
  const patientById = Object.create(null);
  pd.rows.forEach(function(row) {
    const p = rowToObject_(row, pd.index);
    if (p.Report_ID) patientById[String(p.Report_ID)] = p;
  });
  const rd = getData_(referralSheet);
  let changed = 0;
  rd.rows.forEach(function(row, i) {
    const referral = rowToObject_(row, rd.index);
    const patient = patientById[String(referral.Report_ID || '')];
    if (!referral.Referral_ID || !patient) return;
    const merged = Object.assign({}, referral, patientClinicalSnapshot_(patient), {Referral_ID:referral.Referral_ID, Client_Event_ID:referral.Client_Event_ID, Report_ID:referral.Report_ID, Referral_Reason:referral.Referral_Reason, Hospital_ID:referral.Hospital_ID, Hospital_Name:referral.Hospital_Name, Referral_Status:referral.Referral_Status, Sent_By_User_ID:referral.Sent_By_User_ID, Sent_By_Username:referral.Sent_By_Username, Sent_At:referral.Sent_At, Receiving_Personnel:referral.Receiving_Personnel, Response_Remarks:referral.Response_Remarks, Responded_At:referral.Responded_At, Updated_At:referral.Updated_At});
    const out = objectToRow_(merged, rd.index);
    referralSheet.getRange(i + 2, 1, 1, out.length).setValues([out]);
    changed++;
  });
  return changed;
}

function ensureHeaderColumnsAppend_(sheet, headers) {
  if (!sheet) throw new Error('Required sheet is unavailable.');
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1 || sheet.getLastRow() < 1) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(v) { return String(v || '').trim(); });
  const hasHeaders = existing.some(function(v) { return !!v; });
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }
  const set = Object.create(null);
  existing.forEach(function(h) { if (h) set[h] = true; });
  const missing = headers.filter(function(h) { return !set[h]; });
  if (missing.length) sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  sheet.setFrozenRows(1);
}

function seedHospitalFeatureData_() {
  const ss = getDatabaseSpreadsheet_();
  Object.keys({
    HealthFacilityReports: HEADERS.HealthFacilityReports,
    HealthFacilityReportHistory: HEADERS.HealthFacilityReportHistory,
    ConditionCatalog: HEADERS.ConditionCatalog,
    Hospitals: HEADERS.Hospitals,
    HospitalReferrals: HEADERS.HospitalReferrals,
    HospitalReferralHistory: HEADERS.HospitalReferralHistory,
    AuthSessions: HEADERS.AuthSessions
  }).forEach(function(key) {
    const name = APP.SHEETS[key] || key;
    const sh = ss.getSheetByName(name) || ensureSheet_(ss, name, HEADERS[key]);
    ensureHeaderColumnsAppend_(sh, HEADERS[key]);
  });
  seedConditionCatalog_();
  seedHospitals_();
}

function formatFeatureSheets_(spreadsheet) {
  // Use the spreadsheet object supplied by the migration instead of re-opening
  // it through Script Properties. Formatting is deliberately best-effort so
  // intermittent Spreadsheet service errors do not abort the data migration.
  const ss = spreadsheet || getDatabaseSpreadsheet_();
  [APP.SHEETS.CONDITIONS, APP.SHEETS.HOSPITALS, APP.SHEETS.REFERRALS, APP.SHEETS.REFERRAL_HISTORY, APP.SHEETS.AUTH_SESSIONS].forEach(function(name) {
    let formatted = false;
    let lastError = null;
    for (let attempt = 1; attempt <= 3 && !formatted; attempt++) {
      try {
        const sh = ss.getSheetByName(name);
        if (!sh) { formatted = true; break; }
        const width = sh.getLastColumn();
        if (width > 0) sh.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#064088').setFontColor('#ffffff');
        sh.setFrozenRows(1);
        formatted = true;
      } catch (err) {
        lastError = err;
        if (attempt < 3) Utilities.sleep(attempt * 500);
      }
    }
    if (!formatted && lastError) {
      Logger.log('Non-fatal: skipped optional header formatting for ' + name + ' after retries: ' + safeError_(lastError));
    }
  });
}

function seedConditionCatalog_() {
  const sh = getSheet_(APP.SHEETS.CONDITIONS);
  const data = getData_(sh);
  const existing = Object.create(null);
  data.rows.forEach(function(row) { existing[String(row[data.index.Name] || '').trim().toLowerCase()] = true; });
  const defaults = ['Heat Cramps','Heat Fatigue','Dehydration','Heat Exhaustion','Heat Stroke','Dengue','Diarrhea'];
  const rows = defaults.filter(function(name) { return !existing[name.toLowerCase()]; }).map(function(name) {
    const t = now_();
    return [uuid_(), name, true, t, t, 'system', 'system'];
  });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEADERS.ConditionCatalog.length).setValues(rows);
}

function seedHospitals_() {
  const sh = getSheet_(APP.SHEETS.HOSPITALS);
  const data = getData_(sh);
  const existing = Object.create(null);
  data.rows.forEach(function(row) { existing[String(row[data.index.Hospital_ID] || '').trim()] = true; });
  const defaults = [
    ['hospital-dalig','Rizal Provincial Hospital System (Dalig)','RPH Dalig'],
    ['hospital-cabading','Antipolo City Hospital System (Cabading)','ACHS Cabading'],
    ['hospital-mambugan','Antipolo City Hospital System (Mambugan)','ACHS Mambugan']
  ];
  const rows = defaults.filter(function(item) { return !existing[item[0]]; }).map(function(item) {
    return [item[0], item[1], item[2], 0, 0, 0, 0, true, 'system', now_()];
  });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEADERS.Hospitals.length).setValues(rows);
}

function backfillPatientConditionIds_() {
  const patientSheet = getSheet_(APP.SHEETS.PATIENTS);
  const patientData = getData_(patientSheet);
  const catalog = getData_(getSheet_(APP.SHEETS.CONDITIONS));
  const map = Object.create(null);
  catalog.rows.forEach(function(row) {
    const obj = rowToObject_(row, catalog.index);
    const name = String(obj.Name || '').trim().toLowerCase();
    if (name && obj.Condition_ID) map[name] = String(obj.Condition_ID);
  });
  if (patientData.index.Condition_ID === undefined) return;
  patientData.rows.forEach(function(row, i) {
    if (String(row[patientData.index.Condition_ID] || '').trim()) return;
    const name = String(row[patientData.index.Condition] || '').trim().toLowerCase();
    if (map[name]) patientSheet.getRange(i + 2, patientData.index.Condition_ID + 1).setValue(map[name]);
  });
}

function RESET_LIVE_DATA() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert(
    'Reset Live Data?',
    'This clears PatientRecords, Announcements, Inventory, Connectivity, HeatIndex, SyncQueue and AuditLogs. Users and Barangays are retained.',
    ui.ButtonSet.YES_NO
  );

  if (answer !== ui.Button.YES) return;

  [
    APP.SHEETS.PATIENTS,
    APP.SHEETS.ANNOUNCEMENTS,
    APP.SHEETS.INVENTORY,
    APP.SHEETS.INVENTORY_TRANSACTIONS,
    APP.SHEETS.INVENTORY_RELEASES,
    APP.SHEETS.CONNECTIVITY,
    APP.SHEETS.HEAT,
    APP.SHEETS.SYNC,
    APP.SHEETS.AUDIT
  ].forEach(function(name) {
    clearDataRows_(getSheet_(name));
  });

  seedHeatIndexRows_();
  toast_('Live data tables reset.');
}


function CLEAN_DUPLICATE_CENTRAL_INVENTORY() {
  const sh = getSheet_(APP.SHEETS.INVENTORY);
  if (!sh) throw new Error('Inventory sheet not found.');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Another inventory update is in progress. Please try again.');

  try {
    const data = getData_(sh);
    const groups = {};

    for (let idx = 0; idx < data.rows.length; idx++) {
      const ro = rowToObject_(data.rows[idx], data.index);
      if (String(ro.Barangay || '') !== CENTRAL_STOCK_LOCATION) continue;

      const key = [
        String(ro.Category || '').trim().toLowerCase(),
        String(ro.Item_Name || '').trim().toLowerCase(),
        String(ro.Unit || '').trim().toLowerCase()
      ].join('|');

      if (!groups[key]) groups[key] = [];
      groups[key].push({row: idx, obj: ro});
    }

    const deleteRows = [];
    let removed = 0;
    let ambiguous = 0;

    Object.keys(groups).forEach(function(key) {
      const rows = groups[key];
      if (rows.length <= 1) return;

      // Only auto-remove rows that are true exact duplicates of the same
      // item, stock, reorder level, and released count.
      const fingerprint = function(x) {
        return [
          Number(x.Current_Stock || 0),
          Number(x.Reorder_Level || 0),
          Number(x.Released || 0)
        ].join('|');
      };

      const fingerprints = rows.map(function(x){ return fingerprint(x.obj); });
      const exactSame = fingerprints.every(function(x){ return x === fingerprints[0]; });

      if (!exactSame) {
        ambiguous++;
        return;
      }

      rows.sort(function(a,b){ return a.row - b.row; });
      rows.slice(1).forEach(function(entry) {
        deleteRows.push(entry.row);
        removed++;
      });
    });

    // Delete bottom-up so row indexes remain valid.
    deleteRows.sort(function(a,b){ return b-a; }).forEach(function(rowIdx) {
      sh.deleteRow(rowIdx + 2);
    });

    SpreadsheetApp.flush();

    try {
      logAudit_(
        'SYSTEM','SYSTEM','admin','CLEAN_EXACT_DUPLICATE_INVENTORY',
        'Inventory','',
        'Removed ' + removed + ' exact duplicate Central Warehouse row(s).' +
        (ambiguous ? ' Left ' + ambiguous + ' group(s) unchanged because quantities differed.' : '')
      );
    } catch (e) {}

    SpreadsheetApp.getUi().alert(
      'Inventory cleanup complete.\n\n' +
      'Exact duplicate rows removed: ' + removed + '\n' +
      'Groups with different quantities left unchanged: ' + ambiguous
    );

    return {removed: removed, ambiguous: ambiguous};
  } finally {
    lock.releaseLock();
  }
}


function RESET_BHW_PRESENCE() {
  const sh = getSheet_(APP.SHEETS.USERS);
  const data = getData_(sh);
  data.rows.forEach(function(row, i){
    const role = String(row[data.index.Role] || '').toLowerCase();
    if (role === 'bhw') {
      sh.getRange(i + 2, data.index.Last_Seen + 1).setValue('');
      sh.getRange(i + 2, data.index.Device_ID + 1).setValue('');
      sh.getRange(i + 2, data.index.Updated_At + 1).setValue(now_());
    }
  });
  const csh = getSheet_(APP.SHEETS.CONNECTIVITY);
  clearDataRows_(csh);
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert('BHW presence reset. All units are now Offline until a BHW logs in.');
}

function INSTALL_TRIGGERS() {
  installTriggers_();
  SpreadsheetApp.getUi().alert('Triggers installed/refreshed.');
}

function installTriggers_() {
  const handlers = ['scheduledHeartbeatCleanup_','scheduledHeatRefresh_'];

  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (handlers.indexOf(t.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('scheduledHeartbeatCleanup_')
    .timeBased()
    .everyMinutes(5)
    .create();

  // Hourly reference refresh. Does not invent heat index values.
  ScriptApp.newTrigger('scheduledHeatRefresh_')
    .timeBased()
    .everyHours(1)
    .create();
}

function scheduledHeartbeatCleanup_() {
  // Connectivity is derived from Last_Seen, so no destructive cleanup is needed.
  // This function exists as a scheduled heartbeat/status maintenance hook.
  cleanupOldSyncQueue_();
}

function scheduledHeatRefresh_() {
  try {
    refreshPAGASAAWSReference_({
      internal: true,
      user: {User_ID:'SYSTEM',Username:'SYSTEM',Role:'admin',Barangay:'ALL'}
    });
  } catch (err) {
    logAudit_('SYSTEM', 'SYSTEM', 'admin', 'HEAT_REFRESH_ERROR',
      'HeatIndex', '', safeError_(err));
  }
}


/* ======================================================
   SHEET SETUP
   ====================================================== */

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);

  if (!sh) {
    sh = ss.insertSheet(name);
  }

  const existing = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), headers.length))
    .getValues()[0];

  const hasAny = existing.some(function(x){ return String(x).trim() !== ''; });

  if (!hasAny) {
    sh.getRange(1,1,1,headers.length).setValues([headers]);
  } else {
    headers.forEach(function(h, i) {
      const cell = sh.getRange(1, i+1);
      if (!String(cell.getValue()).trim()) {
        cell.setValue(h);
      }
    });
  }

  sh.setFrozenRows(1);
  return sh;
}

function formatAllSheets_() {
  Object.keys(HEADERS).forEach(function(key) {
    const name = APP.SHEETS[key] || key;
    const sh = getSheet_(name);
    if (!sh) return;

    const lastCol = HEADERS[key].length;
    sh.getRange(1,1,1,lastCol)
      .setFontWeight('bold')
      .setBackground('#111827')
      .setFontColor('#ffffff');

    sh.autoResizeColumns(1, lastCol);
  });
}

function seedBarangays_() {
  const sh = getSheet_(APP.SHEETS.BARANGAYS);
  const data = getData_(sh);

  const existing = {};
  data.rows.forEach(function(row) {
    existing[String(row[data.index.Barangay] || '')] = true;
  });

  const rows = APP.BARANGAYS
    .filter(function(b){ return !existing[b]; })
    .map(function(b){
      return [b,true,'','','',now_()];
    });

  if (rows.length) {
    sh.getRange(sh.getLastRow()+1,1,rows.length,6).setValues(rows);
  }
}

function seedSettings_() {
  const sh = getSheet_(APP.SHEETS.SETTINGS);
  const data = getData_(sh);

  const defaults = [
    ['APP_NAME', APP.NAME, 'Application name', now_()],
    ['CITY', APP.CITY, 'Coverage city', now_()],
    ['ONLINE_MINUTES', APP.ONLINE_MINUTES, 'BHW online threshold', now_()],
    ['PENDING_MINUTES', APP.PENDING_MINUTES, 'BHW pending threshold', now_()],
    ['PAGASA_HEAT_URL', APP.PAGASA.HEAT_URL, 'Official iHeatMap page', now_()],
    ['PAGASA_AWS_URL', APP.PAGASA.AWS_URL, 'Official PAGASA AWS page', now_()],
    ['PAGASA_IHEATMAP_URL', APP.PAGASA.IHEATMAP_URL, 'Official PAGASA heat-index page', now_()],
    ['PROFILE_PHOTO_FOLDER', 'Super El Niño — Personnel Photos', 'Google Drive folder for personnel account details', now_()]
  ];

  const existing = {};
  data.rows.forEach(function(row){
    existing[String(row[data.index.Setting] || '')] = true;
  });

  const rows = defaults.filter(function(x){ return !existing[x[0]]; });
  if (rows.length) {
    sh.getRange(sh.getLastRow()+1,1,rows.length,4).setValues(rows);
  }
}

function seedInitialAdmin_() {
  const sh = getSheet_(APP.SHEETS.USERS);
  const data = getData_(sh);

  const hasAdmin = data.rows.some(function(row){
    return String(row[data.index.Role] || '').toLowerCase() === 'admin';
  });

  if (hasAdmin) return;

  const created = now_();
  sh.appendRow([
    uuid_(),
    'System Administrator',
    'admin',
    'admin',
    hashPassword_('admin123'),
    'ALL',
    '09170000001',
    '',
    '',
    '',
    'Active',
    '',
    '',
    created,
    created
  ]);
}

function seedHeatIndexRows_() {
  const sh = getSheet_(APP.SHEETS.HEAT);
  const data = getData_(sh);
  const existing = {};
  data.rows.forEach(function(row){
    existing[String(row[data.index.Barangay] || '')] = true;
  });

  const rows = APP.BARANGAYS
    .filter(function(b){ return !existing[b]; })
    .map(function(b){
      return [
        uuid_(), b, '', '',
        'PAGASA iHeatMap / official source',
        APP.PAGASA.IHEATMAP_URL,
        '',
        '', now_(), false,
        'No per-barangay official value imported yet.'
      ];
    });

  if (rows.length) {
    sh.getRange(sh.getLastRow()+1,1,rows.length,11).setValues(rows);
  }
}


/* ======================================================
   AUTHENTICATION / USERS
   ====================================================== */

function login_(r) {
  const username = String(r.username || '').trim();
  const password = String(r.password || '');
  if (!username || !password) return {ok:false, error:'Username and password are required.'};

  const hash = hashPassword_(password);

  // Fast login cache: avoids a Users-sheet read after a recent successful login.
  // Cache is keyed only by username; the stored hash is still compared, so the
  // plaintext password is never stored. Cache is short-lived and invalidated
  // by saveUser_/deleteUser_ when accounts are changed through the app.
  const loginCache = CacheService.getScriptCache();
  const cacheKey = loginCacheKey_(username);
  const cachedRaw = loginCache.get(cacheKey);
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw);
      if (cached && cached.passwordHash === hash) {
        const cachedUser = cached.user || null;
        if (cachedUser && String(cachedUser.Status || '').toLowerCase() === 'active' && requestedLoginMatches_(cachedUser, r)) {
          const deviceId = String(r.deviceId || '');
          const t = now_();
          cachedUser.Last_Seen = t;
          cachedUser.Device_ID = deviceId;
          cachedUser.Updated_At = t;
          putLiveUserCache_(cachedUser);
          const sessionToken = createAuthSession_(cachedUser, deviceId);
          return {ok:true, user:safeUser_(cachedUser), sessionToken:sessionToken, cached:true};
        }
      }
    } catch (e) {}
  }

  const sh = getSheet_(APP.SHEETS.USERS);
  const data = getData_(sh);
  let foundRow = -1;
  let user = null;

  for (let i = 0; i < data.rows.length; i++) {
    const row = data.rows[i];
    if (
      String(row[data.index.Username] || '').toLowerCase() === username.toLowerCase() &&
      String(row[data.index.Password_Hash] || '') === hash &&
      String(row[data.index.Status] || 'Inactive') === 'Active'
    ) {
      foundRow = i;
      user = rowToObject_(row, data.index);
      break;
    }
  }

  if (foundRow < 0 || !user || !requestedLoginMatches_(user, r)) {
    try { logAudit_('', username, '', 'LOGIN_FAILED', 'Users', '', 'Invalid credentials'); } catch (e) {}
    return {ok:false, error:'Invalid or inactive account.'};
  }

  const deviceId = String(r.deviceId || '');
  const t = now_();
  const lastSeenCol = data.index.Last_Seen + 1;
  const deviceCol = data.index.Device_ID + 1;
  const updatedCol = data.index.Updated_At + 1;

  // One compact row write instead of three separate writes.
  sh.getRange(foundRow + 2, lastSeenCol, 1, 3).setValues([[t, deviceId, t]]);
  user.Last_Seen = t;
  user.Device_ID = deviceId;
  user.Updated_At = t;

  // Cache both the credential match and the live user object for the next few logins.
  loginCache.put(cacheKey, JSON.stringify({passwordHash:hash,user:user}), 60);
  putLiveUserCache_(user);
  const sessionToken = createAuthSession_(user, deviceId);

  return {ok:true, user:safeUser_(user), sessionToken:sessionToken};
}

function requestedLoginMatches_(user, request) {
  const requestedRole = String(request && request.requestedRole || '').trim().toLowerCase();
  if (requestedRole && requestedRole !== String(user.Role || '').toLowerCase()) return false;
  const chosenHospital = String(request && request.hospitalId || '').trim();
  if (String(user.Role || '').toLowerCase() === 'hospital' && chosenHospital && chosenHospital !== String(user.Hospital_ID || '')) return false;
  return true;
}

function loginCacheKey_(username) {
  return 'LOGIN_USER_V1_' + String(username || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '_').slice(0,120);
}

function liveUserCacheKey_(userId) {
  return 'LIVE_USER_V1_' + String(userId || '').trim().slice(0,180);
}

function putLiveUserCache_(user) {
  if (!user || !user.User_ID) return;
  try {
    CacheService.getScriptCache().put(liveUserCacheKey_(user.User_ID), JSON.stringify(user), 60);
  } catch (e) {}
}

function invalidateUserCaches_(userId, username) {
  const keys = [];
  if (userId) keys.push(liveUserCacheKey_(userId));
  if (username) keys.push(loginCacheKey_(username));
  if (keys.length) {
    try { CacheService.getScriptCache().removeAll(keys); } catch (e) {}
  }
}

function repairShiftedUserRows_() {
  const sheet = getSheet_(APP.SHEETS.USERS);
  const data = getData_(sheet);
  const statusIdx = data.index.Status;
  const updatedIdx = data.index.Updated_At;
  if (statusIdx === undefined || updatedIdx === undefined) return;
  // V28-V31 briefly wrote Photo_Data before Status while the current Users headers do not include it.
  // That shifted Status/Last_Seen/Device_ID/Created_At/Updated_At one column to the right and caused
  // newly-created accounts to appear inactive. Repair only that exact pattern.
  if (data.index.Photo_Data !== undefined) return;
  data.rows.forEach(function(row, i){
    const currentStatus = String(row[statusIdx] || '').trim();
    const shiftedStatus = String(row[statusIdx + 1] || '').trim();
    if ((currentStatus !== 'Active' && currentStatus !== 'Inactive') &&
        (shiftedStatus === 'Active' || shiftedStatus === 'Inactive')) {
      const width = Math.max(sheet.getLastColumn(), updatedIdx + 1);
      const fixed = new Array(width).fill('');
      for (let c = 0; c < statusIdx; c++) fixed[c] = row[c] ?? '';
      fixed[statusIdx] = row[statusIdx + 1] ?? '';
      fixed[statusIdx + 1] = row[statusIdx + 2] ?? '';
      fixed[statusIdx + 2] = row[statusIdx + 3] ?? '';
      fixed[statusIdx + 3] = row[statusIdx + 4] ?? '';
      fixed[statusIdx + 4] = row[statusIdx + 5] ?? '';
      sheet.getRange(i + 2, 1, 1, width).setValues([fixed]);
    }
  });
  SpreadsheetApp.flush();
}

function listUsers_(r) {
  requireRole_(r, ['admin']);

  const data = getData_(getSheet_(APP.SHEETS.USERS));

  return {
    ok:true,
    users:data.rows.map(function(row){ return safeUser_(rowToObject_(row, data.index)); })
  };
}

// Aggregate only. Admin sees all barangays; BHW receives only their assigned barangay count.
// No personal details are exposed and the count always comes from the authoritative Users sheet.
function getBhwRegistrationSummary_(r) {
  const actor = requireRole_(r, ['admin','bhw']);
  const data = r.__authUsersData || getData_(getSheet_(APP.SHEETS.USERS));
  const byBarangay = {};
  APP.BARANGAYS.forEach(function(name) {
    byBarangay[name] = {barangay:name,totalAccounts:0,activeAccounts:0,inactiveAccounts:0,pendingAccounts:0,otherStatusAccounts:0};
  });
  const seenIds = {};
  data.rows.forEach(function(row) {
    const u = rowToObject_(row, data.index);
    if (String(u.Role || '').trim().toLowerCase() !== 'bhw') return;
    const barangay = String(u.Barangay || '').trim();
    if (!byBarangay[barangay]) return;
    const id = String(u.User_ID || '').trim();
    if (!id || seenIds[id]) return;
    seenIds[id] = true;
    const item = byBarangay[barangay];
    item.totalAccounts++;
    const status = String(u.Status || '').trim().toLowerCase();
    if (status === 'active') item.activeAccounts++;
    else if (status === 'inactive') item.inactiveAccounts++;
    else if (status === 'pending' || status === 'approval pending') item.pendingAccounts++;
    else item.otherStatusAccounts++;
  });
  let rows = APP.BARANGAYS.map(function(name) { return byBarangay[name]; });
  if (String(actor.Role || '').toLowerCase() === 'bhw') {
    const assigned = String(actor.Barangay || '').trim();
    if (!byBarangay[assigned]) throw new Error('Your account does not have a valid assigned barangay.');
    // Strictly scope BHW response to the authenticated account's assigned barangay.
    rows = [byBarangay[assigned]];
  }
  const totals = rows.reduce(function(out, item) {
    out.totalAccounts += item.totalAccounts;
    out.activeAccounts += item.activeAccounts;
    out.inactiveAccounts += item.inactiveAccounts;
    out.pendingAccounts += item.pendingAccounts;
    out.otherStatusAccounts += item.otherStatusAccounts;
    return out;
  }, {totalAccounts:0,activeAccounts:0,inactiveAccounts:0,pendingAccounts:0,otherStatusAccounts:0});
  return {ok:true,barangays:rows,totals:totals,generatedAt:now_(),scope:String(actor.Role || '').toLowerCase()==='admin'?'all_barangays':'assigned_barangay'};
}

function getPersonnel_(r) {
  requireRole_(r, ['admin','bhw']);

  const data = getData_(getSheet_(APP.SHEETS.USERS));

  const users = data.rows
    .map(function(row){ return rowToObject_(row, data.index); })
    .filter(function(u){ return u.Status === 'Active'; })
    .map(safeUser_);

  return {ok:true, personnel:users};
}

function saveUser_(r) {
  requireRole_(r, ['admin']);
  ensureSheet_(getDatabaseSpreadsheet_(), APP.SHEETS.USERS, HEADERS.Users);
  // Legacy row repair remains available as a manual maintenance function,
  // but is intentionally not run on every user save/login path.

  const u = r.u || r.userData || {};
  const role = String(u.Role || u.role || 'bhw').toLowerCase();
  const name = String(u.Full_Name || u.name || '').trim();
  const username = String(u.Username || u.username || '').trim();
  const contact = String(u.Contact_Number || u.contact || '').trim();
  const barangay = role === 'bhw' ? String(u.Barangay || u.barangay || '').trim() : 'ALL';
  const hospitalId = role === 'hospital' ? String(u.Hospital_ID || u.hospitalId || '').trim() : '';

  if (!name || !username || !contact) throw new Error('Full name, username and contact number are required.');
  if (role === 'bhw' && APP.BARANGAYS.indexOf(barangay) === -1) throw new Error('BHW account must have one valid assigned barangay.');
  if (role === 'hospital' && !getHospitalById_(hospitalId)) throw new Error('Hospital account must be assigned to one valid hospital.');
  if (['admin','bhw','hospital'].indexOf(role) === -1) throw new Error('Invalid account role.');

  const sheet = getSheet_(APP.SHEETS.USERS);
  const data = getData_(sheet);
  const id = String(u.User_ID || u.userId || '') || uuid_();
  const existing = findRowById_(data, id, 'User_ID');
  const oldUsername = existing ? String(data.rows[existing.row][data.index.Username] || '').trim() : '';

  const duplicate = data.rows.some(function(row){
    const rowUsername = String(row[data.index.Username] || '').trim().toLowerCase();
    const rowId = String(row[data.index.User_ID] || '');
    return rowUsername === username.toLowerCase() && rowId !== id;
  });
  if (duplicate) throw new Error('Username already exists.');

  if (existing) {
    const old = rowToObject_(data.rows[existing.row], data.index);
    if (String(old.Username).toLowerCase() === 'admin' && username.toLowerCase() !== 'admin') throw new Error('Primary admin username cannot be changed.');
    if (String(old.Username).toLowerCase() === 'admin' && role !== 'admin') throw new Error('Primary admin role cannot be changed.');
  }

  // Lightweight production build: no new profile photo upload/storage.
  // Preserve existing photo fields when present, but build the row by header name
  // so Status/Last_Seen/etc. can never be shifted by a missing optional column.
  const photoFileId = existing && data.index.Photo_File_ID !== undefined ? String(data.rows[existing.row][data.index.Photo_File_ID] || '') : '';
  const photoUrl = existing && data.index.Photo_URL !== undefined ? String(data.rows[existing.row][data.index.Photo_URL] || '') : '';
  const createdAt = existing ? (data.rows[existing.row][data.index.Created_At] || now_()) : now_();
  const updatedAt = now_();
  let oneTimeTemporaryPassword = '';
  if (role === 'hospital' && !existing && !String(u.password || '')) oneTimeTemporaryPassword = generateTemporaryHospitalPassword_();
  const suppliedPassword = String(u.password || oneTimeTemporaryPassword || '');
  const oldMustChange = existing && data.index.Must_Change_Password !== undefined ? data.rows[existing.row][data.index.Must_Change_Password] : false;
  const obj = {
    User_ID:id,
    Full_Name:name,
    Role:role,
    Username:username,
    Password_Hash:suppliedPassword ? hashPassword_(suppliedPassword) : (existing ? data.rows[existing.row][data.index.Password_Hash] : hashPassword_('ChangeMe123!')),
    Barangay:barangay,
    Hospital_ID:hospitalId,
    Must_Change_Password:role === 'hospital' ? (suppliedPassword ? true : (String(oldMustChange).toLowerCase() === 'true' || oldMustChange === true || oldMustChange === 1)) : false,
    Contact_Number:contact,
    Photo_File_ID:photoFileId,
    Photo_URL:photoUrl,
    Status:String(u.Status || u.status || 'Active'),
    Last_Seen:existing ? data.rows[existing.row][data.index.Last_Seen] : '',
    Device_ID:existing ? data.rows[existing.row][data.index.Device_ID] : '',
    Created_At:createdAt,
    Updated_At:updatedAt
  };
  // If an older sheet still has a Photo_Data column, keep the existing value but do not add/upload new data.
  if (data.index.Photo_Data !== undefined && existing) obj.Photo_Data = String(data.rows[existing.row][data.index.Photo_Data] || '');

  const row = objectToRow_(obj, data.index);
  if (existing) sheet.getRange(existing.row + 2, 1, 1, row.length).setValues([row]);
  else sheet.getRange(sheet.getLastRow()+1, 1, 1, row.length).setValues([row]);
  SpreadsheetApp.flush();

  const verify = getData_(sheet);
  const verified = findRowById_(verify, id, 'User_ID');
  if (!verified) throw new Error('User save could not be verified in the Users sheet.');

  syncBarangayAssignment_();
  SpreadsheetApp.flush();

  if (suppliedPassword && existing) revokeOtherAuthSessions_(id, r.sessionToken || r.session_token || '');
  const saved = getUserById_(id);
  if (!saved) throw new Error('User was written but could not be re-read from the Users sheet.');

  invalidateUserCaches_(id, oldUsername);
  invalidateUserCaches_(id, saved.Username);
  putLiveUserCache_(saved);
  try {
    CacheService.getScriptCache().put(
      loginCacheKey_(saved.Username),
      JSON.stringify({passwordHash:saved.Password_Hash || '', user:saved}),
      60
    );
  } catch (e) {}

  logAudit_(r.user.User_ID, r.user.Username, r.user.Role, existing ? 'UPDATE_USER' : 'CREATE_USER', 'Users', id, existing ? 'Updated account' : 'Created account');
  return {ok:true, user:safeUser_(saved), persisted:true, temporaryPassword:oneTimeTemporaryPassword || undefined};
}
function deleteUser_(r) {
  requireRole_(r, ['admin']);

  const id = String(r.userId || '');
  if (!id) throw new Error('User ID is required.');

  const target = getUserById_(id);
  if (!target) throw new Error('User not found.');

  if (target.Username === 'admin') {
    throw new Error('Primary admin account cannot be deleted.');
  }

  const sh = getSheet_(APP.SHEETS.USERS);
  const data = getData_(sh);
  const found = findRowById_(data, id, 'User_ID');

  if (!found) throw new Error('User not found.');

  sh.deleteRow(found.row + 2);

  logAudit_(r.user.User_ID, r.user.Username, r.user.Role,
    'DELETE_USER', 'Users', id, 'Deleted account');

  invalidateUserCaches_(id, target.Username);
  syncBarangayAssignment_();

  return {ok:true};
}

function saveProfilePhoto_(dataUrl, userName, userId) {
  const folder = getOrCreatePhotoFolder_();

  const match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid profile image data.');

  const mime = match[1];
  const bytes = Utilities.base64Decode(match[2]);
  const safeName = sanitizeFileName_(userName || 'user') + '_' + userId + '.jpg';

  const blob = Utilities.newBlob(bytes, mime, safeName);
  const file = folder.createFile(blob);

  // Anyone-with-link is convenient for the personnel directory.
  // If your organization policy disallows this, change the sharing policy.
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    // Do not fail the account save just because organization sharing policy blocks it.
  }

  return {
    fileId:file.getId(),
    url:'https://drive.google.com/uc?export=view&id=' + file.getId(),
    dataUrl:String(dataUrl)
  };
}

function uploadPhoto_(r) {
  requireRole_(r, ['admin']);

  if (!r.photoData || !r.userId) {
    throw new Error('User ID and photo are required.');
  }

  const photo = saveProfilePhoto_(r.photoData, r.userName || 'user', r.userId);

  const sh = getSheet_(APP.SHEETS.USERS);
  const data = getData_(sh);
  const found = findRowById_(data, String(r.userId), 'User_ID');

  if (!found) throw new Error('User not found.');

  sh.getRange(found.row + 2, data.index.Photo_File_ID + 1).setValue(photo.fileId);
  sh.getRange(found.row + 2, data.index.Photo_URL + 1).setValue(photo.url);
  if (data.index.Photo_Data !== undefined) {
    sh.getRange(found.row + 2, data.index.Photo_Data + 1).setValue(photo.dataUrl);
  }
  sh.getRange(found.row + 2, data.index.Updated_At + 1).setValue(now_());
  SpreadsheetApp.flush();

  return {ok:true, photo:photo, persisted:true};
}

function REPAIR_PROFILE_PHOTO_DATA() {
  ensureSheet_(getDatabaseSpreadsheet_(), APP.SHEETS.USERS, HEADERS.Users);

  const sh = getSheet_(APP.SHEETS.USERS);
  const data = getData_(sh);
  if (data.index.Photo_Data === undefined) {
    throw new Error('Photo_Data column is missing. Run INITIALIZE_SYSTEM first.');
  }

  let repaired = 0;
  let skipped = 0;
  let failed = 0;

  data.rows.forEach(function(row, idx) {
    const fileId = String(row[data.index.Photo_File_ID] || '').trim();
    const existingData = String(row[data.index.Photo_Data] || '').trim();
    if (!fileId || existingData) return;

    try {
      const file = DriveApp.getFileById(fileId);
      const blob = file.getBlob();
      const mime = String(blob.getContentType() || 'image/jpeg');
      const base64 = Utilities.base64Encode(blob.getBytes());
      const dataUrl = 'data:' + mime + ';base64,' + base64;

      if (dataUrl.length > 49000) {
        skipped++;
        return;
      }

      sh.getRange(idx + 2, data.index.Photo_Data + 1).setValue(dataUrl);
      repaired++;
    } catch (err) {
      failed++;
    }
  });

  SpreadsheetApp.flush();
  return {ok:true, repaired:repaired, skipped:skipped, failed:failed};
}



/* ======================================================
   PUBLIC DASHBOARD BRANDING (ADMIN-EDITABLE TITLE + HERO IMAGE)
   The image stays private in Drive. Public clients receive only the intentionally public image bytes
   through this endpoint; no Drive file is shared with "anyone with the link".
   ====================================================== */
function getOrCreatePublicBrandingFolder_() {
  const props = PropertiesService.getScriptProperties();
  const savedId = String(props.getProperty('PUBLIC_BRANDING_FOLDER_ID') || '').trim();
  let folder = null;
  if (savedId) { try { folder = DriveApp.getFolderById(savedId); } catch (e) { folder = null; } }
  if (!folder) {
    folder = DriveApp.createFolder('Emergency - Connect Public Branding (Private)');
    try { folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW); folder.setShareableByEditors(false); }
    catch (e) { try { folder.setTrashed(true); } catch (ignore) {} throw new Error('Could not secure dashboard branding storage.'); }
    if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE) {
      try { folder.setTrashed(true); } catch (ignore) {}
      throw new Error('Dashboard branding folder must be private.');
    }
    props.setProperty('PUBLIC_BRANDING_FOLDER_ID', folder.getId());
  }
  try {
    if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE) folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
    folder.setShareableByEditors(false);
  } catch (e) { throw new Error('Could not verify private dashboard branding storage.'); }
  if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error('Dashboard branding storage is not private.');
  return folder;
}

function getDefaultPublicBrandingActions_() {
  return [
    {icon:'☀', label:'Heat Response', target:'heat', url:''},
    {icon:'📍', label:'Barangay Tally', target:'tally', url:''},
    {icon:'🏥', label:'Community Reports', target:'reports', url:''}
  ];
}

function sanitizePublicBrandingActions_(items) {
  const allowedTargets = ['heat','tally','reports','announcements','hospitals','top','external'];
  let input = items;
  if (typeof input === 'string') { try { input = JSON.parse(input); } catch (e) { throw new Error('Quick-action settings could not be read.'); } }
  if (!Array.isArray(input)) input = getDefaultPublicBrandingActions_();
  return input.slice(0,3).map(function(item, index) {
    const fallback = getDefaultPublicBrandingActions_()[index] || {icon:'',label:'',target:'reports',url:''};
    const icon = String(item && item.icon !== undefined ? item.icon : fallback.icon).replace(/[\u0000-\u001F\u007F]/g,'').trim().slice(0,8);
    const label = String(item && item.label !== undefined ? item.label : fallback.label).replace(/[\u0000-\u001F\u007F]/g,'').replace(/\s+/g,' ').trim().slice(0,36);
    let target = String(item && item.target || fallback.target).trim();
    if (allowedTargets.indexOf(target) < 0) target = fallback.target;
    let url = String(item && item.url || '').trim().slice(0,500);
    if (target === 'external' && label) {
      if (!/^https:\/\//i.test(url)) throw new Error('Quick-action button ' + (index + 1) + ' requires a valid HTTPS URL.');
      if (/^[\s]*javascript:/i.test(url)) throw new Error('Unsafe quick-action URL rejected.');
    } else if (target !== 'external') url = '';
    return {icon:icon, label:label, target:target, url:url};
  });
}

function getPublicBranding_(r) {
  const props = PropertiesService.getScriptProperties();
  const title = String(props.getProperty('PUBLIC_DASHBOARD_TITLE') || 'SUPER EL NIÑO').trim() || 'SUPER EL NIÑO';
  const kicker = String(props.getProperty('PUBLIC_DASHBOARD_KICKER') || 'Heat Alert Monitoring • Community Health Surveillance').trim();
  const description = String(props.getProperty('PUBLIC_DASHBOARD_DESCRIPTION') || 'Public situation dashboard for heat-related illness reports.').trim();
  let actions = getDefaultPublicBrandingActions_();
  const actionsJson = String(props.getProperty('PUBLIC_DASHBOARD_ACTIONS_JSON') || '').trim();
  if (actionsJson) { try { actions = sanitizePublicBrandingActions_(JSON.parse(actionsJson)); } catch (e) { actions = getDefaultPublicBrandingActions_(); } }
  const fileId = String(props.getProperty('PUBLIC_DASHBOARD_IMAGE_FILE_ID') || '').trim();
  const result = {ok:true, title:title, kicker:kicker, description:description, actions:actions, hasCustomImage:!!fileId, updatedAt:String(props.getProperty('PUBLIC_DASHBOARD_BRANDING_UPDATED_AT') || 'default')};
  if (r && r.includeLogo === false) return result;
  if (fileId) {
    try {
      const file = DriveApp.getFileById(fileId);
      const blob = file.getBlob();
      const mime = String(blob.getContentType() || file.getMimeType() || '').toLowerCase();
      if (!/^image\/(png|jpeg|webp)$/.test(mime)) throw new Error('Unsupported branding image type.');
      const bytes = blob.getBytes();
      if (!bytes || bytes.length > 1024 * 1024) throw new Error('Stored dashboard image exceeds the 1 MB delivery limit.');
      result.logoDataUrl = 'data:' + mime + ';base64,' + Utilities.base64Encode(bytes);
    } catch (e) {
      // Never expose the Drive file URL as a fallback; default artwork remains safe.
      result.hasCustomImage = false;
      result.logoDataUrl = '';
      result.imageWarning = 'Saved branding image could not be loaded; using the default logo.';
    }
  } else result.logoDataUrl = '';
  return result;
}

function savePublicBranding_(r) {
  const actor = requireRole_(r, ['admin']);
  const title = String(r.title || '').trim().replace(/\s+/g, ' ');
  const kicker = String(r.kicker === undefined ? 'Heat Alert Monitoring • Community Health Surveillance' : r.kicker).replace(/\s+/g, ' ').trim();
  const description = String(r.description === undefined ? 'Public situation dashboard for heat-related illness reports.' : r.description).replace(/\s+/g, ' ').trim();
  const actions = sanitizePublicBrandingActions_(r.actions);
  if (!title || title.length > 80) throw new Error('Dashboard title is required and must be 80 characters or fewer.');
  if (kicker.length > 120) throw new Error('Dashboard subtitle must be 120 characters or fewer.');
  if (description.length > 180) throw new Error('Dashboard description must be 180 characters or fewer.');
  const props = PropertiesService.getScriptProperties();
  const oldFileId = String(props.getProperty('PUBLIC_DASHBOARD_IMAGE_FILE_ID') || '').trim();
  let newFileId = oldFileId;
  let uploadedFile = null;
  const clearLogo = r.clearLogo === true || String(r.clearLogo).toLowerCase() === 'true';
  const dataUrl = String(r.logoDataUrl || '');
  if (dataUrl) {
    if (dataUrl.length > 1450000) throw new Error('Optimized logo/image must be 1 MB or smaller. Choose a smaller image.');
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
    if (!match) throw new Error('Please select a JPG, PNG, or WebP image.');
    const mime = String(match[1]).toLowerCase();
    let bytes;
    try { bytes = Utilities.base64Decode(match[2].replace(/\s/g, '')); } catch (e) { throw new Error('Image could not be decoded. Please select it again.'); }
    if (!bytes || bytes.length > 1024 * 1024) throw new Error('Optimized image must be 1 MB or smaller.');
    const sig = bytes.slice(0, 12).map(function(b) { return Number(b) & 255; });
    const validJpeg = mime === 'image/jpeg' && sig[0] === 255 && sig[1] === 216 && sig[2] === 255;
    const validPng = mime === 'image/png' && sig.slice(0,8).join(',') === '137,80,78,71,13,10,26,10';
    const validWebp = mime === 'image/webp' && String.fromCharCode.apply(null, sig.slice(0,4)) === 'RIFF' && String.fromCharCode.apply(null, sig.slice(8,12)) === 'WEBP';
    if (!validJpeg && !validPng && !validWebp) throw new Error('The selected file is not a valid image.');
    const folder = getOrCreatePublicBrandingFolder_();
    const extension = mime === 'image/png' ? 'png' : (mime === 'image/webp' ? 'webp' : 'jpg');
    uploadedFile = folder.createFile(Utilities.newBlob(bytes, mime, 'dashboard-branding-' + Date.now() + '.' + extension));
    try { uploadedFile.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW); }
    catch (e) { try { uploadedFile.setTrashed(true); } catch (ignore) {} throw new Error('Could not keep the dashboard image private. Save was blocked.'); }
    if (uploadedFile.getSharingAccess() !== DriveApp.Access.PRIVATE) { try { uploadedFile.setTrashed(true); } catch (ignore) {} throw new Error('Dashboard image must remain private. Save was blocked.'); }
    newFileId = uploadedFile.getId();
  } else if (clearLogo) newFileId = '';

  const updatedAt = now_();
  // Store only small settings and the file ID in script properties; never store image bytes in Sheets/properties.
  props.setProperty('PUBLIC_DASHBOARD_TITLE', title);
  props.setProperty('PUBLIC_DASHBOARD_KICKER', kicker);
  props.setProperty('PUBLIC_DASHBOARD_DESCRIPTION', description);
  props.setProperty('PUBLIC_DASHBOARD_ACTIONS_JSON', JSON.stringify(actions));
  if (newFileId) props.setProperty('PUBLIC_DASHBOARD_IMAGE_FILE_ID', newFileId);
  else props.deleteProperty('PUBLIC_DASHBOARD_IMAGE_FILE_ID');
  props.setProperty('PUBLIC_DASHBOARD_BRANDING_UPDATED_AT', updatedAt);
  if (oldFileId && oldFileId !== newFileId) { try { DriveApp.getFileById(oldFileId).setTrashed(true); } catch (ignore) {} }
  try { logAudit_(actor.User_ID, actor.Username, actor.Role, 'UPDATE_PUBLIC_BRANDING', 'PublicDashboard', 'branding', 'Header text/actions updated; custom image ' + (newFileId ? 'set' : 'default')); } catch (ignore) {}
  return {ok:true, branding:{title:title, kicker:kicker, description:description, actions:actions, hasCustomImage:!!newFileId, updatedAt:updatedAt}};
}

/* ======================================================
   DYNAMIC CONDITIONS
   ====================================================== */

function getConditions_(r) {
  requireRole_(r, ['admin','bhw']);
  const sh = getSheet_(APP.SHEETS.CONDITIONS);
  const data = getData_(sh);
  const conditions = data.rows.map(function(row) { return rowToObject_(row, data.index); })
    .map(function(c) { return {Condition_ID:String(c.Condition_ID || ''), Name:String(c.Name || ''), Active:String(c.Active).toLowerCase() !== 'false' && c.Active !== 0 && String(c.Active).toLowerCase() !== 'inactive', Created_At:c.Created_At || '', Updated_At:c.Updated_At || ''}; })
    .filter(function(c) { return !!c.Condition_ID && !!c.Name; })
    .sort(function(a,b) { return a.Name.localeCompare(b.Name); });
  return {ok:true, conditions:conditions};
}

/** Public-safe active condition catalog. Returns labels only, never patient or user data. */
function getPublicConditions_() {
  const sh = getSheet_(APP.SHEETS.CONDITIONS);
  const data = getData_(sh);
  const conditions = data.rows.map(function(row) { return rowToObject_(row, data.index); })
    .map(function(c) { return {Name:String(c.Name || '').trim(), Active:String(c.Active).toLowerCase() !== 'false' && c.Active !== 0 && String(c.Active).toLowerCase() !== 'inactive'}; })
    .filter(function(c) { return !!c.Name && c.Active; })
    .map(function(c) { return c.Name; });
  const unique = Array.from(new Set(conditions)).sort(function(a,b) { return a.localeCompare(b); });
  return {ok:true, conditions:unique, updatedAt:now_()};
}

function saveCondition_(r) {
  const actor = requireRole_(r, ['admin']);
  const c = r.condition || {};
  const name = String(c.Name || c.name || '').trim().replace(/\s+/g, ' ');
  const id = String(c.Condition_ID || c.id || '').trim() || uuid_();
  const active = !(c.Active === false || String(c.Active).toLowerCase() === 'false' || String(c.Active).toLowerCase() === 'inactive');
  if (!name || name.length > 100) throw new Error('Condition name is required and must be 100 characters or fewer.');
  const sh = getSheet_(APP.SHEETS.CONDITIONS);
  const data = getData_(sh);
  const existing = findRowById_(data, id, 'Condition_ID');
  const duplicate = data.rows.some(function(row) {
    const otherId = String(row[data.index.Condition_ID] || '');
    const otherName = String(row[data.index.Name] || '').trim().toLowerCase();
    return otherName === name.toLowerCase() && otherId !== id;
  });
  if (duplicate) throw new Error('A condition with this name already exists.');
  const t = now_();
  const obj = {
    Condition_ID:id, Name:name, Active:active,
    Created_At:existing ? data.rows[existing.row][data.index.Created_At] || t : t,
    Updated_At:t,
    Created_By_User_ID:existing ? data.rows[existing.row][data.index.Created_By_User_ID] || actor.User_ID : actor.User_ID,
    Updated_By_User_ID:actor.User_ID
  };
  const row = objectToRow_(obj, data.index);
  if (existing) sh.getRange(existing.row + 2, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
  logAudit_(actor.User_ID, actor.Username, actor.Role, existing ? 'UPDATE_CONDITION' : 'CREATE_CONDITION', 'ConditionCatalog', id, name + ' (' + (active ? 'active' : 'inactive') + ')');
  return {ok:true, condition:obj};
}

function resolveCondition_(name, conditionId, existingRecord) {
  const data = getData_(getSheet_(APP.SHEETS.CONDITIONS));
  let chosen = null;
  if (conditionId) {
    const id = String(conditionId);
    for (let i = 0; i < data.rows.length; i++) {
      const obj = rowToObject_(data.rows[i], data.index);
      if (String(obj.Condition_ID) === id) { chosen = obj; break; }
    }
  }
  if (!chosen) {
    const match = String(name || '').trim().toLowerCase();
    for (let i = 0; i < data.rows.length; i++) {
      const obj = rowToObject_(data.rows[i], data.index);
      if (String(obj.Name || '').trim().toLowerCase() === match) { chosen = obj; break; }
    }
  }
  if (chosen) {
    const active = String(chosen.Active).toLowerCase() !== 'false' && chosen.Active !== 0 && String(chosen.Active).toLowerCase() !== 'inactive';
    if (!active && !(existingRecord && (String(existingRecord.Condition_ID || '') === String(chosen.Condition_ID) || String(existingRecord.Condition || '').trim().toLowerCase() === String(name || '').trim().toLowerCase()))) {
      throw new Error('This condition is inactive. Refresh the report form and choose an active condition.');
    }
    return {id:String(chosen.Condition_ID), name:String(chosen.Name)};
  }
  // Allow an existing historical record to keep a legacy condition even if it is not in the active catalog.
  if (existingRecord && String(existingRecord.Condition || '') === String(name || '')) {
    return {id:String(existingRecord.Condition_ID || ''), name:String(existingRecord.Condition || '')};
  }
  throw new Error('Condition is not in the active catalog. Refresh the form and select an available condition.');
}

function applyCatalogNamesToPatients_(rows) {
  if (!Array.isArray(rows) || !rows.length) return rows || [];
  const data = getData_(getSheet_(APP.SHEETS.CONDITIONS));
  const names = Object.create(null);
  data.rows.forEach(function(row) { const o = rowToObject_(row, data.index); if (o.Condition_ID) names[String(o.Condition_ID)] = String(o.Name || ''); });
  rows.forEach(function(p) { const id = String(p.Condition_ID || ''); if (id && names[id]) p.Condition = names[id]; });
  return rows;
}

/* ======================================================
   HOSPITAL REGISTRY, BEDS AND REFERRALS
   ====================================================== */

function getPublicHospitals_() {
  const data = getData_(getSheet_(APP.SHEETS.HOSPITALS));
  const hospitals = data.rows.map(function(row) { return rowToObject_(row, data.index); })
    .filter(function(h) { return String(h.Active).toLowerCase() !== 'false' && h.Active !== 0 && String(h.Active).toLowerCase() !== 'inactive'; })
    .map(function(h) { return {
      Hospital_ID:String(h.Hospital_ID || ''), Hospital_Name:String(h.Hospital_Name || ''), Short_Name:String(h.Short_Name || ''),
      ER_Capacity:positiveInt_(h.ER_Capacity), ER_Available:boundedAvailable_(h.ER_Available, h.ER_Capacity),
      Ward_Capacity:positiveInt_(h.Ward_Capacity), Ward_Available:boundedAvailable_(h.Ward_Available, h.Ward_Capacity),
      Updated_At:h.Updated_At || ''
    }; });
  return {ok:true, hospitals:hospitals, generatedAt:now_()};
}

function getAdminHospitals_(r) {
  requireRole_(r, ['admin']);
  const publicData = getPublicHospitals_();
  const referralSummary = buildHospitalReferralSummary_();
  return {ok:true, hospitals:publicData.hospitals, summaries:referralSummary, generatedAt:now_()};
}

function getHospitalById_(hospitalId) {
  const data = getData_(getSheet_(APP.SHEETS.HOSPITALS));
  for (let i = 0; i < data.rows.length; i++) {
    const h = rowToObject_(data.rows[i], data.index);
    if (String(h.Hospital_ID || '') === String(hospitalId || '')) return {row:i, data:data, sheet:getSheet_(APP.SHEETS.HOSPITALS), item:h};
  }
  return null;
}

function saveHospitalCapacity_(r) {
  const actor = requireRole_(r, ['admin']);
  const id = String(r.hospitalId || r.Hospital_ID || '');
  const found = getHospitalById_(id);
  if (!found) throw new Error('Hospital was not found.');
  const erCap = integerInRange_(r.erCapacity, 0, 100000, 'ER capacity');
  const wardCap = integerInRange_(r.wardCapacity, 0, 100000, 'Ward capacity');
  const erAvailable = positiveInt_(found.item.ER_Available);
  const wardAvailable = positiveInt_(found.item.Ward_Available);
  if (erAvailable > erCap || wardAvailable > wardCap) throw new Error('New capacity cannot be lower than the current available-bed count. Adjust availability first.');
  const updated = Object.assign({}, found.item, {ER_Capacity:erCap, Ward_Capacity:wardCap, Updated_By_User_ID:actor.User_ID, Updated_At:now_()});
  const row = objectToRow_(updated, found.data.index);
  found.sheet.getRange(found.row + 2, 1, 1, row.length).setValues([row]);
  logAudit_(actor.User_ID, actor.Username, actor.Role, 'UPDATE_HOSPITAL_CAPACITY', 'Hospitals', id, 'ER capacity ' + erCap + '; Ward capacity ' + wardCap);
  return {ok:true, hospital:publicHospitalObject_(updated)};
}

function updateHospitalBeds_(r) {
  const actor = requireRole_(r, ['hospital']);
  ensureHospitalPasswordChanged_(actor);
  const id = String(actor.Hospital_ID || '');
  if (!id) throw new Error('This hospital account has not been assigned to a hospital. Contact the Admin.');
  const found = getHospitalById_(id);
  if (!found) throw new Error('Assigned hospital was not found.');
  const erDelta = integerDelta_(r.erDelta, 'ER bed adjustment');
  const wardDelta = integerDelta_(r.wardDelta, 'Ward bed adjustment');
  if (Math.abs(erDelta) > 1 || Math.abs(wardDelta) > 1 || (erDelta === 0 && wardDelta === 0)) throw new Error('Use one plus or minus adjustment at a time.');
  const erCapacity = positiveInt_(found.item.ER_Capacity);
  const wardCapacity = positiveInt_(found.item.Ward_Capacity);
  const erAvailable = positiveInt_(found.item.ER_Available) + erDelta;
  const wardAvailable = positiveInt_(found.item.Ward_Available) + wardDelta;
  if (erAvailable < 0 || erAvailable > erCapacity) throw new Error('ER available beds must remain between 0 and the configured ER capacity.');
  if (wardAvailable < 0 || wardAvailable > wardCapacity) throw new Error('Ward available beds must remain between 0 and the configured Ward capacity.');
  const updated = Object.assign({}, found.item, {ER_Available:erAvailable, Ward_Available:wardAvailable, Updated_By_User_ID:actor.User_ID, Updated_At:now_()});
  const row = objectToRow_(updated, found.data.index);
  found.sheet.getRange(found.row + 2, 1, 1, row.length).setValues([row]);
  logAudit_(actor.User_ID, actor.Username, actor.Role, 'UPDATE_HOSPITAL_BEDS', 'Hospitals', id, 'ER available ' + erAvailable + '/' + erCapacity + '; Ward available ' + wardAvailable + '/' + wardCapacity);
  return {ok:true, hospital:publicHospitalObject_(updated)};
}

function getHospitalDashboard_(r) {
  const actor = requireRole_(r, ['hospital']);
  ensureHospitalPasswordChanged_(actor);
  const found = getHospitalById_(actor.Hospital_ID);
  if (!found) throw new Error('Hospital assignment is invalid. Contact the Admin.');
  const all = getHospitalReferralRows_(found.item.Hospital_ID);
  return {ok:true, hospital:publicHospitalObject_(found.item), referrals:all, summary:countHospitalReferrals_(all), generatedAt:now_()};
}

function getHospitalReferrals_(r) {
  const actor = requireRole_(r, ['admin','hospital']);
  if (String(actor.Role).toLowerCase() === 'hospital') {
    ensureHospitalPasswordChanged_(actor);
    return {ok:true, referrals:getHospitalReferralRows_(actor.Hospital_ID), scope:'assigned_hospital'};
  }
  return {ok:true, referrals:getHospitalReferralRows_(null), scope:'all_hospitals'};
}

function getHospitalReferralSummary_(r) {
  requireRole_(r, ['admin']);
  return {ok:true, summaries:buildHospitalReferralSummary_(), totals:buildReferralTotals_(), generatedAt:now_()};
}

function buildHospitalReferralSummary_() {
  const hospitals = getPublicHospitals_().hospitals;
  const all = getHospitalReferralRows_(null);
  return hospitals.map(function(h) {
    const items = all.filter(function(x) { return String(x.Hospital_ID) === String(h.Hospital_ID); });
    const sum = countHospitalReferrals_(items);
    return Object.assign({}, h, {totalSent:sum.totalReceived, totalReceived:sum.totalReceived, pending:sum.pending, accepted:sum.accepted, refused:sum.refused});
  });
}

function buildReferralTotals_() {
  return countHospitalReferrals_(getHospitalReferralRows_(null));
}

function countHospitalReferrals_(items) {
  const out = {totalReceived:0,pending:0,accepted:0,refused:0};
  (items || []).forEach(function(x) {
    out.totalReceived++;
    const status = String(x.Referral_Status || 'Pending').toLowerCase();
    if (status === 'accepted') out.accepted++;
    else if (status === 'refused') out.refused++;
    else out.pending++;
  });
  return out;
}

function patientClinicalSnapshot_(p) {
  p = p || {};
  return {
    Patient_Name:p.Patient_Name || '', Age:p.Age === undefined ? '' : p.Age, Age_Group:p.Age_Group || '',
    Sex:p.Sex || '', Barangay:p.Barangay || '', Condition:p.Condition || '', Condition_ID:p.Condition_ID || '',
    Contact_Number:p.Contact_Number || '', Date_Time:p.Date_Time || '', Blood_Pressure:p.Blood_Pressure || '',
    Temperature_C:p.Temperature_C === undefined ? '' : p.Temperature_C, Heart_Rate:p.Heart_Rate === undefined ? '' : p.Heart_Rate,
    Respiratory_Rate:p.Respiratory_Rate === undefined ? '' : p.Respiratory_Rate, Oxygen_Saturation:p.Oxygen_Saturation === undefined ? '' : p.Oxygen_Saturation,
    GCS:p.GCS === undefined ? '' : p.GCS, Chief_Complaint:p.Chief_Complaint || '', Working_Diagnosis:p.Working_Diagnosis || '',
    Disposition:p.Disposition || '', Notes:p.Notes || ''
  };
}

function getHospitalReferralRows_(hospitalId) {
  const referralData = getData_(getSheet_(APP.SHEETS.REFERRALS));
  const patientData = getData_(getSheet_(APP.SHEETS.PATIENTS));
  const patientById = Object.create(null);
  const attachmentCounts = countPatientAttachmentsByReport_();
  patientData.rows.forEach(function(row) {
    const p = rowToObject_(row, patientData.index);
    if (p.Report_ID) patientById[String(p.Report_ID)] = p;
  });
  return referralData.rows.map(function(row) {
    const referral = rowToObject_(row, referralData.index);
    const patient = patientById[String(referral.Report_ID || '')];
    // Current PatientRecords is authoritative for patient demographics and clinical fields.
    // Referral destination/status/response stay on the referral record.
    const merged = patient ? Object.assign({}, referral, patientClinicalSnapshot_(patient)) : referral;
    merged.Attachment_Count = Number(attachmentCounts[String(referral.Report_ID || '')] || 0);
    return merged;
  })
    .filter(function(x) { return !!x.Referral_ID && (!hospitalId || String(x.Hospital_ID) === String(hospitalId)); })
    .sort(function(a,b) { return new Date(b.Sent_At || 0).getTime() - new Date(a.Sent_At || 0).getTime(); });
}

function sendHospitalReferral_(r) {
  const actor = requireRole_(r, ['admin']);
  const reportId = String(r.reportId || r.Report_ID || '').trim();
  const hospitalId = String(r.hospitalId || r.Hospital_ID || '').trim();
  const eventId = String(r.clientEventId || r.Client_Event_ID || '').trim() || uuid_();
  const reason = String(r.reason || r.Referral_Reason || '').trim();
  if (!reportId || !hospitalId) throw new Error('Patient report and receiving hospital are required.');
  if (!reason) throw new Error('Referral reason is required.');
  if (reason.length > 3000) throw new Error('Referral reason must be 3,000 characters or fewer.');
  const h = getHospitalById_(hospitalId);
  if (!h || String(h.item.Active).toLowerCase() === 'false') throw new Error('Receiving hospital is not active.');
  const patientSheet = getSheet_(APP.SHEETS.PATIENTS);
  const patients = getData_(patientSheet);
  const patientFound = findRowById_(patients, reportId, 'Report_ID');
  if (!patientFound) throw new Error('Patient record was not found in the authoritative PatientRecords sheet.');
  const p = rowToObject_(patients.rows[patientFound.row], patients.index);
  if (!String(p.Patient_Name || '').trim()) throw new Error('The patient record has no patient name.');
  const refSheet = getSheet_(APP.SHEETS.REFERRALS);
  const data = getData_(refSheet);
  const duplicate = data.rows.map(function(row) { return rowToObject_(row, data.index); }).find(function(x) { return String(x.Client_Event_ID || '') === eventId; });
  if (duplicate) return {ok:true, duplicate:true, referral:duplicate};
  const referralId = uuid_();
  const now = now_();
  const currentCondition = resolveCondition_(p.Condition, p.Condition_ID, p);
  const referralPatient = Object.assign({}, p, {Condition:currentCondition.name, Condition_ID:currentCondition.id, Disposition:'Referred to hospital'});
  const obj = Object.assign({}, referralPatient, {
    Referral_ID:referralId, Client_Event_ID:eventId, Report_ID:reportId,
    Patient_Name:String(p.Patient_Name || ''), Age:p.Age === undefined ? '' : p.Age, Sex:p.Sex || '', Barangay:p.Barangay || '',
    Condition:currentCondition.name, Contact_Number:p.Contact_Number || '', Date_Time:p.Date_Time || '',
    Notes:String(p.Notes || ''), Referral_Reason:reason, Hospital_ID:h.item.Hospital_ID, Hospital_Name:h.item.Hospital_Name,
    Referral_Status:'Pending', Sent_By_User_ID:actor.User_ID, Sent_By_Username:actor.Username, Sent_At:now,
    Receiving_Personnel:'', Response_Remarks:'', Responded_At:'', Updated_At:now
  });
  ensureHeaderColumnsAppend_(refSheet, HEADERS.HospitalReferrals);
  const currentReferralData = getData_(refSheet);
  refSheet.appendRow(objectToRow_(obj, currentReferralData.index));
  const existingPatient = Object.assign({}, p, {Condition:currentCondition.name, Condition_ID:currentCondition.id, Disposition:'Referred to hospital', Updated_At:now});
  const patientRow = objectToRow_(Object.assign({}, p, existingPatient), patients.index);
  patientSheet.getRange(patientFound.row + 2, 1, 1, patientRow.length).setValues([patientRow]);
  SpreadsheetApp.flush();
  updateReferralPatientSnapshot_(existingPatient);
  appendReferralHistory_(obj, 'REFERRAL_SENT', '', 'Pending', 'Referral sent by Admin. ' + reason, actor);
  logAudit_(actor.User_ID, actor.Username, actor.Role, 'SEND_HOSPITAL_REFERRAL', 'HospitalReferrals', referralId, 'Sent to ' + h.item.Hospital_Name + ' for report ' + reportId);
  return {ok:true, duplicate:false, referral:obj};
}

function respondHospitalReferral_(r) {
  const actor = requireRole_(r, ['hospital']);
  ensureHospitalPasswordChanged_(actor);
  const id = String(r.referralId || r.Referral_ID || '');
  const status = String(r.status || '').trim();
  const receiver = String(r.receivingPersonnel || r.Receiving_Personnel || '').trim();
  const remarks = String(r.remarks || r.Response_Remarks || '').trim();
  if (!id) throw new Error('Referral ID is required.');
  if (['Accepted','Refused'].indexOf(status) === -1) throw new Error('Hospital response must be Accepted or Refused.');
  if (!receiver || receiver.length > 160) throw new Error('Receiving personnel name is required (maximum 160 characters).');
  if (status === 'Refused' && !remarks) throw new Error('Remarks are required when refusing a referral.');
  if (remarks.length > 3000) throw new Error('Remarks must be 3,000 characters or fewer.');
  const sh = getSheet_(APP.SHEETS.REFERRALS);
  const data = getData_(sh);
  const found = findRowById_(data, id, 'Referral_ID');
  if (!found) throw new Error('Referral not found.');
  const item = rowToObject_(data.rows[found.row], data.index);
  if (String(item.Hospital_ID) !== String(actor.Hospital_ID)) throw new Error('This referral is assigned to another hospital.');
  const oldStatus = String(item.Referral_Status || 'Pending');
  const updatedAt = now_();
  item.Referral_Status = status;
  item.Receiving_Personnel = receiver;
  item.Response_Remarks = remarks;
  item.Responded_At = updatedAt;
  item.Updated_At = updatedAt;
  sh.getRange(found.row + 2, 1, 1, objectToRow_(item, data.index).length).setValues([objectToRow_(item, data.index)]);
  appendReferralHistory_(item, 'HOSPITAL_RESPONSE', oldStatus, status, remarks, actor, receiver);
  logAudit_(actor.User_ID, actor.Username, actor.Role, 'RESPOND_HOSPITAL_REFERRAL', 'HospitalReferrals', id, status + ' by ' + receiver);
  return {ok:true, referral:item};
}

function appendReferralHistory_(referral, action, fromStatus, toStatus, remarks, actor, receivingPersonnel) {
  const sh = getSheet_(APP.SHEETS.REFERRAL_HISTORY);
  const data = getData_(sh);
  const obj = {
    History_ID:uuid_(), Referral_ID:referral.Referral_ID, Report_ID:referral.Report_ID,
    Hospital_ID:referral.Hospital_ID, Action:action, From_Status:fromStatus || '', To_Status:toStatus || '',
    Receiving_Personnel:receivingPersonnel || '', Remarks:remarks || '', Changed_By_User_ID:actor.User_ID,
    Changed_By_Username:actor.Username, Changed_By_Role:actor.Role, Changed_At:now_()
  };
  sh.appendRow(objectToRow_(obj, data.index));
}

function changeHospitalPassword_(r) {
  const actor = requireRole_(r, ['hospital']);
  const currentPassword = String(r.currentPassword || '');
  const newPassword = String(r.newPassword || '');
  if (newPassword.length < 10 || newPassword.length > 128) throw new Error('New password must be 10 to 128 characters.');
  if (newPassword === currentPassword) throw new Error('Choose a password different from the temporary password.');
  const sh = getSheet_(APP.SHEETS.USERS);
  const data = getData_(sh);
  const found = findRowById_(data, actor.User_ID, 'User_ID');
  if (!found) throw new Error('Account was not found.');
  const row = data.rows[found.row];
  if (String(row[data.index.Password_Hash] || '') !== hashPassword_(currentPassword)) throw new Error('Current password is incorrect.');
  const obj = rowToObject_(row, data.index);
  obj.Password_Hash = hashPassword_(newPassword);
  obj.Must_Change_Password = false;
  obj.Updated_At = now_();
  sh.getRange(found.row + 2, 1, 1, objectToRow_(obj, data.index).length).setValues([objectToRow_(obj, data.index)]);
  invalidateUserCaches_(actor.User_ID, actor.Username);
  const freshData = getData_(sh);
  const freshFound = findRowById_(freshData, actor.User_ID, 'User_ID');
  const saved = freshFound ? rowToObject_(freshData.rows[freshFound.row], freshData.index) : obj;
  REQUEST_AUTH_[actor.User_ID] = {user:saved, usersData:freshData};
  putLiveUserCache_(saved);
  revokeOtherAuthSessions_(actor.User_ID, r.sessionToken || r.session_token || '');
  logAudit_(actor.User_ID, actor.Username, actor.Role, 'CHANGE_HOSPITAL_PASSWORD', 'Users', actor.User_ID, 'Hospital account changed temporary password');
  return {ok:true,user:safeUser_(saved)};
}

function ensureHospitalPasswordChanged_(actor) {
  if (String(actor.Must_Change_Password).toLowerCase() === 'true' || actor.Must_Change_Password === true || actor.Must_Change_Password === 1) {
    throw new Error('Password change required before using the hospital dashboard.');
  }
}

function publicHospitalObject_(h) {
  return {Hospital_ID:String(h.Hospital_ID || ''),Hospital_Name:String(h.Hospital_Name || ''),Short_Name:String(h.Short_Name || ''),ER_Capacity:positiveInt_(h.ER_Capacity),ER_Available:boundedAvailable_(h.ER_Available,h.ER_Capacity),Ward_Capacity:positiveInt_(h.Ward_Capacity),Ward_Available:boundedAvailable_(h.Ward_Available,h.Ward_Capacity),Active:String(h.Active).toLowerCase() !== 'false' && h.Active !== 0 && String(h.Active).toLowerCase() !== 'inactive',Updated_At:h.Updated_At || ''};
}
function positiveInt_(value) { const n=Number(value); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; }
function boundedAvailable_(value, capacity) { const cap=positiveInt_(capacity), v=positiveInt_(value); return Math.min(v,cap); }
function integerInRange_(value, min, max, label) { const n=Number(value); if(!Number.isInteger(n)||n<min||n>max)throw new Error(label+' must be an integer between '+min+' and '+max+'.'); return n; }
function integerDelta_(value, label) { const n=Number(value); if(!Number.isInteger(n)||n < -1 || n > 1)throw new Error(label+' must be -1, 0 or 1.'); return n; }

function generateTemporaryHospitalPassword_() {
  const a = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  return 'Hosp-' + a + '!';
}

/* ======================================================
   PATIENT RECORDS
   ====================================================== */

function getOrCreatePatientAttachmentsFolder_() {
  const props = PropertiesService.getScriptProperties();
  const savedId = String(props.getProperty('PATIENT_ATTACHMENTS_FOLDER_ID') || '').trim();
  let folder = null;
  if (savedId) {
    try { folder = DriveApp.getFolderById(savedId); } catch (e) { folder = null; }
  }
  if (!folder) {
    // Always create a new folder instead of reusing a similarly named folder
    // that another person may already have shared with others.
    folder = DriveApp.createFolder('Emergency - Connect Patient Attachments (Private)');
    try {
      folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
      folder.setShareableByEditors(false);
    } catch (e) {
      try { if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE) { folder.setTrashed(true); throw new Error('Could not ensure private attachment folder access.'); } }
      catch (verifyErr) { throw new Error('Could not ensure private attachment folder access. ' + safeError_(verifyErr)); }
    }
    if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE) {
      try { folder.setTrashed(true); } catch (ignore) {}
      throw new Error('Patient attachment folder must be private. No files were uploaded.');
    }
    props.setProperty('PATIENT_ATTACHMENTS_FOLDER_ID', folder.getId());
  }
  // Refuse broad access; patient/laboratory files must not be public.
  try {
    if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE) {
      folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
    }
    folder.setShareableByEditors(false);
  } catch (err) {
    throw new Error('Could not verify private access for patient attachment storage. Contact the system owner.');
  }
  if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE) {
    throw new Error('Patient attachment storage is not private. Upload was blocked.');
  }
  return folder;
}

function getPatientAttachmentSheet_(createIfMissing) {
  const ss = getDatabaseSpreadsheet_();
  let sh = ss.getSheetByName(APP.SHEETS.PATIENT_ATTACHMENTS);
  if (!sh && createIfMissing) sh = ensureSheet_(ss, APP.SHEETS.PATIENT_ATTACHMENTS, HEADERS.PatientAttachments);
  if (sh && createIfMissing) ensureHeaderColumnsAppend_(sh, HEADERS.PatientAttachments);
  return sh;
}

function authorizePatientAttachmentAccess_(actor, reportId) {
  const id = String(reportId || '').trim();
  if (!id) throw new Error('Patient report ID is required.');
  const patientData = getData_(getSheet_(APP.SHEETS.PATIENTS));
  const found = findRowById_(patientData, id, 'Report_ID');
  if (!found) throw new Error('Patient record was not found.');
  const patient = rowToObject_(patientData.rows[found.row], patientData.index);
  const role = String(actor.Role || '').toLowerCase();
  if (role === 'bhw' && String(patient.Barangay || '') !== String(actor.Barangay || '')) {
    throw new Error('BHW cannot access attachments for another barangay.');
  }
  if (role === 'hospital') {
    ensureHospitalPasswordChanged_(actor);
    const assignedHospital = String(actor.Hospital_ID || '');
    if (!assignedHospital) throw new Error('Hospital assignment is missing.');
    const refSheet = getSheet_(APP.SHEETS.REFERRALS);
    const refData = getData_(refSheet);
    const hasReferral = refData.rows.some(function(row) {
      return String(row[refData.index.Report_ID] || '') === id && String(row[refData.index.Hospital_ID] || '') === assignedHospital;
    });
    if (!hasReferral) throw new Error('This patient attachment is not available to your hospital.');
  }
  return patient;
}

function isAttachmentActive_(value) {
  const s = String(value === undefined || value === null ? '' : value).trim().toLowerCase();
  return value === true || value === 1 || s === '' || s === 'true' || s === '1' || s === 'yes' || s === 'active';
}

function listPatientAttachments_(r) {
  const actor = requireRole_(r, ['admin','bhw','hospital']);
  const reportId = String(r.reportId || r.Report_ID || '').trim();
  authorizePatientAttachmentAccess_(actor, reportId);
  const sheet = getPatientAttachmentSheet_(false);
  if (!sheet || sheet.getLastRow() < 2) return {ok:true, attachments:[], reportId:reportId};
  const data = getData_(sheet);
  const attachments = data.rows.map(function(row) { return rowToObject_(row, data.index); })
    .filter(function(x) { return String(x.Report_ID || '') === reportId && isAttachmentActive_(x.Active); })
    .map(function(x) { return {
      Attachment_ID:String(x.Attachment_ID || ''), Report_ID:String(x.Report_ID || ''),
      File_Name:String(x.File_Name || 'Patient photo'), Mime_Type:String(x.Mime_Type || 'image/jpeg'),
      Size_Bytes:Number(x.Size_Bytes || 0), Uploaded_At:x.Uploaded_At || '',
      Uploaded_By_Username:String(x.Uploaded_By_Username || '')
    }; })
    .filter(function(x) { return !!x.Attachment_ID; })
    .sort(function(a,b) { return new Date(a.Uploaded_At || 0).getTime() - new Date(b.Uploaded_At || 0).getTime(); });
  return {ok:true, attachments:attachments, reportId:reportId};
}

function uploadPatientAttachment_(r) {
  const actor = requireRole_(r, ['admin','bhw']);
  const reportId = String(r.reportId || r.Report_ID || '').trim();
  const clientEventId = String(r.clientEventId || r.Client_Event_ID || '').trim();
  const fileNameRaw = String(r.fileName || 'laboratory-photo.jpg').trim();
  const dataUrl = String(r.dataUrl || '');
  if (!clientEventId) throw new Error('Attachment submission ID is required for duplicate protection.');
  if (!dataUrl || dataUrl.length > 4300000) throw new Error('Attachment is empty or too large. Select a smaller image (maximum 3 MB after compression).');
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) throw new Error('Only JPG, PNG, or WebP images are supported.');
  const mime = String(match[1]).toLowerCase();
  let bytes;
  try { bytes = Utilities.base64Decode(match[2].replace(/\s/g, '')); } catch (e) { throw new Error('Image data could not be decoded. Please select the photo again.'); }
  if (!bytes || !bytes.length || bytes.length > 3 * 1024 * 1024) throw new Error('Image must be 3 MB or smaller after compression.');
  const sig = bytes.slice(0, 12).map(function(b) { return Number(b) & 255; });
  const validJpeg = mime === 'image/jpeg' && sig[0] === 255 && sig[1] === 216 && sig[2] === 255;
  const validPng = mime === 'image/png' && sig.slice(0,8).join(',') === '137,80,78,71,13,10,26,10';
  const validWebp = mime === 'image/webp' && String.fromCharCode.apply(null, sig.slice(0,4)) === 'RIFF' && String.fromCharCode.apply(null, sig.slice(8,12)) === 'WEBP';
  if (!validJpeg && !validPng && !validWebp) throw new Error('The selected file is not a valid JPG, PNG, or WebP image.');

  const patient = authorizePatientAttachmentAccess_(actor, reportId);
  const sheet = getPatientAttachmentSheet_(true);
  const data = getData_(sheet);
  const existing = data.rows.map(function(row) { return rowToObject_(row, data.index); }).find(function(x) { return String(x.Client_Event_ID || '') === clientEventId; });
  if (existing) {
    if (String(existing.Report_ID || '') !== reportId) throw new Error('Attachment submission ID collision. Please retry the upload.');
    return {ok:true, duplicate:true, attachment:{Attachment_ID:existing.Attachment_ID, Report_ID:reportId, File_Name:existing.File_Name, Mime_Type:existing.Mime_Type, Size_Bytes:existing.Size_Bytes, Uploaded_At:existing.Uploaded_At}};
  }
  const existingActiveCount = data.rows.filter(function(row) { return String(row[data.index.Report_ID] || '') === reportId && isAttachmentActive_(row[data.index.Active]); }).length;
  if (existingActiveCount >= 10) throw new Error('A patient report can have up to 10 photo attachments.');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Another upload is in progress. Please try again.');
  let file = null;
  try {
    // Recheck inside the lock to avoid duplicate files on concurrent/retried submissions.
    const currentData = getData_(sheet);
    const dup = currentData.rows.map(function(row) { return rowToObject_(row, currentData.index); }).find(function(x) { return String(x.Client_Event_ID || '') === clientEventId; });
    if (dup) {
      if (String(dup.Report_ID || '') !== reportId) throw new Error('Attachment submission ID collision. Please retry the upload.');
      return {ok:true, duplicate:true, attachment:{Attachment_ID:dup.Attachment_ID, Report_ID:reportId, File_Name:dup.File_Name, Mime_Type:dup.Mime_Type, Size_Bytes:dup.Size_Bytes, Uploaded_At:dup.Uploaded_At}};
    }
    const lockedCount = currentData.rows.filter(function(row) { return String(row[currentData.index.Report_ID] || '') === reportId && isAttachmentActive_(row[currentData.index.Active]); }).length;
    if (lockedCount >= 10) throw new Error('A patient report can have up to 10 photo attachments.');
    const folder = getOrCreatePatientAttachmentsFolder_();
    const safe = sanitizeFileName_(fileNameRaw).replace(/\.(?:jpe?g|png|webp)$/i, '') || 'laboratory-photo';
    const finalName = safe.slice(0,72) + '.jpg';
    const blob = Utilities.newBlob(bytes, mime, finalName);
    file = folder.createFile(blob);
    try {
      file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
    } catch (sharingErr) {
      if (file.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error('Could not keep the uploaded patient photo private. Upload was blocked.');
    }
    if (file.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error('Uploaded image is not private. Upload was blocked.');
    const item = {
      Attachment_ID:uuid_(), Client_Event_ID:clientEventId, Report_ID:reportId, File_ID:file.getId(), File_URL:file.getUrl(),
      File_Name:finalName, Mime_Type:mime, Size_Bytes:bytes.length,
      Uploaded_By_User_ID:actor.User_ID, Uploaded_By_Username:actor.Username,
      Uploaded_By_Role:actor.Role, Uploaded_At:now_(), Active:true
    };
    sheet.appendRow(objectToRow_(item, currentData.index));
    SpreadsheetApp.flush();
    logAudit_(actor.User_ID, actor.Username, actor.Role, 'UPLOAD_PATIENT_ATTACHMENT', 'PatientAttachments', item.Attachment_ID, 'Private image uploaded for report ' + reportId);
    return {ok:true, duplicate:false, attachment:{Attachment_ID:item.Attachment_ID, Report_ID:reportId, File_Name:item.File_Name, Mime_Type:item.Mime_Type, Size_Bytes:item.Size_Bytes, Uploaded_At:item.Uploaded_At}};
  } catch (err) {
    if (file) { try { file.setTrashed(true); } catch (ignore) {} }
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function getPatientAttachmentData_(r) {
  const actor = requireRole_(r, ['admin','bhw','hospital']);
  const attachmentId = String(r.attachmentId || r.Attachment_ID || '').trim();
  if (!attachmentId) throw new Error('Attachment ID is required.');
  const sheet = getPatientAttachmentSheet_(false);
  if (!sheet || sheet.getLastRow() < 2) throw new Error('No attachment was found.');
  const data = getData_(sheet);
  const found = findRowById_(data, attachmentId, 'Attachment_ID');
  if (!found) throw new Error('Attachment was not found.');
  const item = rowToObject_(data.rows[found.row], data.index);
  if (!isAttachmentActive_(item.Active)) throw new Error('Attachment is no longer available.');
  authorizePatientAttachmentAccess_(actor, item.Report_ID);
  const fileId = String(item.File_ID || '');
  if (!fileId) throw new Error('Attachment file reference is missing.');
  const file = DriveApp.getFileById(fileId);
  if (file.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error('Attachment storage is not private. Access was blocked.');
  const blob = file.getBlob();
  if (blob.getBytes().length > 3 * 1024 * 1024) throw new Error('Stored photo is larger than the supported viewing limit.');
  const mime = String(blob.getContentType() || item.Mime_Type || 'image/jpeg');
  if (!/^image\/(jpeg|png|webp)$/i.test(mime)) throw new Error('Unsupported attachment type.');
  return {ok:true, attachment:{Attachment_ID:attachmentId, File_Name:String(item.File_Name || 'Patient photo'), Mime_Type:mime, Data_URL:'data:' + mime + ';base64,' + Utilities.base64Encode(blob.getBytes())}};
}

function countPatientAttachmentsByReport_() {
  const out = Object.create(null);
  const sheet = getPatientAttachmentSheet_(false);
  if (!sheet || sheet.getLastRow() < 2) return out;
  const data = getData_(sheet);
  data.rows.forEach(function(row) {
    const reportId = String(row[data.index.Report_ID] || '');
    if (reportId && isAttachmentActive_(row[data.index.Active])) out[reportId] = (out[reportId] || 0) + 1;
  });
  return out;
}

function listPatients_(r) {
  requireRole_(r, ['admin','bhw']);

  const data = getData_(getSheet_(APP.SHEETS.PATIENTS));
  let rows = data.rows.map(function(row){ return rowToObject_(row, data.index); });
  rows = applyCatalogNamesToPatients_(rows);

  if (r.user.Role === 'bhw') {
    rows = rows.filter(function(x){ return x.Barangay === r.user.Barangay; });
  }

  if (r.barangay) {
    if (r.user.Role === 'bhw' && r.barangay !== r.user.Barangay) {
      throw new Error('BHW cannot access another barangay.');
    }
    rows = rows.filter(function(x){ return x.Barangay === r.barangay; });
  }

  return {ok:true, patients:rows};
}

function savePatient_(r) {
  const actor = requireRole_(r, ['admin','bhw']);
  const p = r.patient || {};
  const sh = getSheet_(APP.SHEETS.PATIENTS);
  ensureHeaderColumnsAppend_(sh, HEADERS.PatientRecords);
  const data = getData_(sh);

  const reportId = String(p.Report_ID || p.reportId || '') || uuid_();
  const clientEventId = String(p.Client_Event_ID || p.clientEventId || '') || reportId;
  const found = findRowById_(data, reportId, 'Report_ID');
  const existingObject = found ? rowToObject_(data.rows[found.row], data.index) : null;
  const existing = existingObject || {};

  const rawBarangay = p.Barangay !== undefined ? p.Barangay : (p.barangay !== undefined ? p.barangay : existing.Barangay || '');
  let barangay = String(rawBarangay || '').trim();
  if (actor.Role === 'bhw') {
    if (!barangay) barangay = String(actor.Barangay || '').trim();
    if (barangay !== String(actor.Barangay || '').trim()) throw new Error('BHW cannot change the assigned barangay.');
  }
  if (APP.BARANGAYS.indexOf(barangay) === -1) throw new Error('Invalid barangay.');

  // Both the browser and offline queue use lower camelCase; accept either casing.
  const rawAge = p.Age !== undefined ? p.Age : (p.age !== undefined ? p.age : (existing.Age !== undefined ? existing.Age : ''));
  let age = '';
  if (rawAge !== '' && rawAge !== null && rawAge !== undefined) {
    age = Number(rawAge);
    if (!Number.isFinite(age) || age < 0 || age > 130) throw new Error('Age must be a number between 0 and 130.');
  }
  const ageGroup = age === '' ? (existing.Age_Group || '') : ageGroup_(age);
  const rawName = p.Patient_Name !== undefined ? p.Patient_Name : (p.name !== undefined ? p.name : existing.Patient_Name || '');
  const name = String(rawName || '').trim();
  const rawCondition = p.Condition !== undefined ? p.Condition : (p.condition !== undefined ? p.condition : existing.Condition || '');
  const rawConditionId = p.Condition_ID !== undefined ? p.Condition_ID : (p.conditionId !== undefined ? p.conditionId : existing.Condition_ID || '');
  const resolvedCondition = resolveCondition_(String(rawCondition || '').trim(), String(rawConditionId || ''), existingObject);
  const rawSex = p.Sex !== undefined ? p.Sex : (p.sex !== undefined ? p.sex : existing.Sex || '');
  const rawDate = p.Date_Time !== undefined ? p.Date_Time : (p.date !== undefined ? p.date : existing.Date_Time || now_());
  const rawCritical = p.Critical !== undefined ? p.Critical : (p.critical !== undefined ? p.critical : existing.Critical);
  const critical = normalizeBoolean_(rawCritical);
  const rawStatus = p.Status !== undefined ? p.Status : (p.status !== undefined ? p.status : existing.Status);

  const patient = Object.assign({}, existing, {
    Report_ID: reportId,
    Client_Event_ID: clientEventId,
    Date_Time: rawDate || now_(),
    Patient_Name: name,
    Age: age,
    Sex: String(rawSex || ''),
    Age_Group: ageGroup,
    Barangay: barangay,
    Condition: resolvedCondition.name,
    Condition_ID: resolvedCondition.id,
    Contact_Number: String(p.Contact_Number !== undefined ? p.Contact_Number : (p.contact !== undefined ? p.contact : existing.Contact_Number || '')).trim(),
    Blood_Pressure: String(p.Blood_Pressure !== undefined ? p.Blood_Pressure : (p.bp !== undefined ? p.bp : existing.Blood_Pressure || '')).trim(),
    Temperature_C: p.Temperature_C !== undefined ? p.Temperature_C : (p.temp !== undefined ? p.temp : existing.Temperature_C || ''),
    Heart_Rate: p.Heart_Rate !== undefined ? p.Heart_Rate : (p.hr !== undefined ? p.hr : existing.Heart_Rate || ''),
    Respiratory_Rate: p.Respiratory_Rate !== undefined ? p.Respiratory_Rate : (p.rr !== undefined ? p.rr : existing.Respiratory_Rate || ''),
    Oxygen_Saturation: p.Oxygen_Saturation !== undefined ? p.Oxygen_Saturation : (p.o2sat !== undefined ? p.o2sat : existing.Oxygen_Saturation || ''),
    GCS: p.GCS !== undefined ? p.GCS : (p.gcs !== undefined ? p.gcs : existing.GCS || ''),
    Chief_Complaint: String(p.Chief_Complaint !== undefined ? p.Chief_Complaint : (p.chiefComplaint !== undefined ? p.chiefComplaint : existing.Chief_Complaint || '')).trim(),
    Working_Diagnosis: String(p.Working_Diagnosis !== undefined ? p.Working_Diagnosis : (p.workingDiagnosis !== undefined ? p.workingDiagnosis : existing.Working_Diagnosis || '')).trim(),
    Disposition: String(p.Disposition !== undefined ? p.Disposition : (p.disposition !== undefined ? p.disposition : existing.Disposition || '')).trim(),
    Notes: String(p.Notes !== undefined ? p.Notes : (p.notes !== undefined ? p.notes : existing.Notes || '')).trim(),
    Critical: critical,
    Status: String(rawStatus || (critical ? 'Critical' : (existing.Status || 'Review'))),
    Created_By: existing.Created_By || actor.Username,
    Created_By_Role: existing.Created_By_Role || actor.Role,
    Device_ID: String(p.Device_ID || p.deviceId || r.deviceId || actor.Device_ID || existing.Device_ID || ''),
    Sync_Status: 'synced',
    Created_At: existing.Created_At || p.Created_At || p.createdAt || now_(),
    Updated_At: now_()
  });

  if (!patient.Patient_Name || !patient.Condition) throw new Error('Patient name and condition are required.');

  if (found) {
    if (actor.Role === 'bhw' && String(existing.Barangay || '') !== String(actor.Barangay || '')) {
      throw new Error('BHW cannot edit another barangay record.');
    }
    // Merge into existing row object first so any legacy/custom columns retain their values.
    const merged = Object.assign({}, existingObject, patient);
    const row = objectToRow_(merged, data.index);
    sh.getRange(found.row + 2, 1, 1, row.length).setValues([row]);
  } else {
    const row = objectToRow_(patient, data.index);
    sh.appendRow(row);
  }

  SpreadsheetApp.flush();
  const savedData = getData_(sh);
  const savedFound = findRowById_(savedData, reportId, 'Report_ID');
  if (!savedFound) throw new Error('Save verification failed: patient record was not found in PatientRecords after writing.');
  const savedPatient = rowToObject_(savedData.rows[savedFound.row], savedData.index);
  if (String(savedPatient.Patient_Name || '').trim() !== patient.Patient_Name || String(savedPatient.Barangay || '') !== patient.Barangay) {
    throw new Error('Save verification failed: PatientRecords values do not match the submitted record. Please check the sheet headers and run MIGRATE_HOSPITAL_FEATURES again.');
  }
  if (rawAge !== '' && rawAge !== null && rawAge !== undefined && Number(savedPatient.Age) !== Number(rawAge)) {
    throw new Error('Save verification failed: Age was not written to the Age column. Please run MIGRATE_HOSPITAL_FEATURES and retry.');
  }

  updateReferralPatientSnapshot_(savedPatient);
  logAudit_(actor.User_ID, actor.Username, actor.Role, found ? 'UPDATE_PATIENT' : 'CREATE_PATIENT', 'PatientRecords', reportId, found ? 'Patient record updated and read-back verified' : 'Patient record created and read-back verified');
  return {ok:true, action:found ? 'updated' : 'created', duplicate:false, patient:savedPatient, verified:true};
}

function normalizeBoolean_(value) {
  if (value === true || value === 1) return true;
  const s = String(value === undefined || value === null ? '' : value).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'critical';
}

function syncReports_(r) {
  requireRole_(r, ['admin','bhw']);

  const reports = Array.isArray(r.reports) ? r.reports : [];
  const results = [];

  reports.forEach(function(item){
    try {
      const action = String(item.action || 'upsert');

      if (action === 'delete') {
        results.push(deletePatient_({
          user:r.user,
          sessionToken:r.sessionToken || r.session_token || '',
          reportId:item.reportId || item.Report_ID,
          sync:true
        }));
        return;
      }

      const result = savePatient_({
        user:r.user,
        sessionToken:r.sessionToken || r.session_token || '',
        patient:item.payload || item,
        deviceId:r.deviceId || item.deviceId || ''
      });

      results.push({
        ok:true,
        reportId:result.patient.Report_ID,
        action:result.action
      });

    } catch (err) {
      results.push({
        ok:false,
        reportId:item.reportId || item.Report_ID || '',
        error:safeError_(err)
      });
    }
  });

  return {
    ok:true,
    results:results
  };
}

function updateReferralPatientSnapshot_(patient) {
  if (!patient || !patient.Report_ID) return 0;
  const sh = getSheet_(APP.SHEETS.REFERRALS);
  ensureHeaderColumnsAppend_(sh, HEADERS.HospitalReferrals);
  const data = getData_(sh);
  const clinical = patientClinicalSnapshot_(patient);
  let changed = 0;
  data.rows.forEach(function(row, i) {
    const item = rowToObject_(row, data.index);
    if (String(item.Report_ID || '') !== String(patient.Report_ID)) return;
    const merged = Object.assign({}, item, clinical, {
      Referral_ID:item.Referral_ID, Client_Event_ID:item.Client_Event_ID, Report_ID:item.Report_ID,
      Referral_Reason:item.Referral_Reason, Hospital_ID:item.Hospital_ID, Hospital_Name:item.Hospital_Name,
      Referral_Status:item.Referral_Status, Sent_By_User_ID:item.Sent_By_User_ID, Sent_By_Username:item.Sent_By_Username,
      Sent_At:item.Sent_At, Receiving_Personnel:item.Receiving_Personnel, Response_Remarks:item.Response_Remarks,
      Responded_At:item.Responded_At, Updated_At:now_()
    });
    const out = objectToRow_(merged, data.index);
    sh.getRange(i + 2, 1, 1, out.length).setValues([out]);
    changed++;
  });
  SpreadsheetApp.flush();
  return changed;
}

function deletePatient_(r) {
  requireRole_(r, ['admin']);

  const reportId = String(r.reportId || '');
  if (!reportId) throw new Error('Report ID is required.');

  const sh = getSheet_(APP.SHEETS.PATIENTS);
  const data = getData_(sh);
  const found = findRowById_(data, reportId, 'Report_ID');

  if (!found) {
    return {ok:true, action:'already_deleted', reportId:reportId};
  }

  sh.deleteRow(found.row + 2);

  logAudit_(
    r.user.User_ID, r.user.Username, r.user.Role,
    'DELETE_PATIENT', 'PatientRecords', reportId, 'Patient record deleted'
  );

  return {
    ok:true,
    action:'deleted',
    reportId:reportId
  };
}


/* ======================================================
   ANNOUNCEMENTS
   ====================================================== */

function ensureAnnouncementSheetSchema_(sheet) {
  if (!sheet) throw new Error('Announcements sheet not found.');

  // Add any missing canonical columns without clearing or reordering existing data.
  const lastRow = sheet.getLastRow();
  let lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) {
    const required = HEADERS.Announcements.slice();
    sheet.getRange(1, 1, 1, required.length).setValues([required]);
    SpreadsheetApp.flush();
    return;
  }

  const currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function(h) { return String(h || '').trim(); });
  const currentSet = {};
  currentHeaders.forEach(function(h) { if (h) currentSet[h] = true; });
  const missing = HEADERS.Announcements.filter(function(h) { return !currentSet[h]; });
  if (missing.length) {
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
    SpreadsheetApp.flush();
  }
}

function getAnnouncementData_() {
  const sheet = getSheet_(APP.SHEETS.ANNOUNCEMENTS);
  ensureAnnouncementSheetSchema_(sheet);
  return getData_(sheet);
}

function announcementActiveValue_(value, blankMeansActive) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const text = String(value === undefined || value === null ? '' : value).trim().toLowerCase();
  if (!text) return !!blankMeansActive;
  if (['false','0','no','inactive','unpublished','draft','off','disabled','expired'].indexOf(text) !== -1) return false;
  return ['true','1','yes','active','published','on','enabled'].indexOf(text) !== -1;
}

function announcementBarangayMatches_(target, assigned) {
  const normalize = function(v) { return String(v || '').trim().toLowerCase().replace(/\s+/g, ' '); };
  const targetKey = normalize(target);
  const assignedKey = normalize(assigned);
  return targetKey === 'all barangays' || targetKey === 'all' || (!!assignedKey && targetKey === assignedKey);
}

// Header lookup is case/spacing/punctuation insensitive so older Announcements
// sheets such as "title", "Announcement Title", "Message", and "Target Barangay"
// are read even after canonical columns have been appended to the sheet.
function announcementField_(source, names) {
  const values = Object.create(null);
  const normalize = function(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
  Object.keys(source || {}).forEach(function(key) {
    const nk = normalize(key);
    const value = source[key];
    if (!(nk in values) || (value !== '' && value !== null && value !== undefined)) values[nk] = value;
  });
  for (let i = 0; i < names.length; i++) {
    const nk = normalize(names[i]);
    if (values[nk] !== undefined && values[nk] !== null && String(values[nk]).trim() !== '') return values[nk];
  }
  return '';
}

function normalizeAnnouncementRecord_(announcement) {
  const out = Object.assign({}, announcement || {});
  out.Announcement_ID = String(announcementField_(out, ['Announcement_ID','AnnouncementID','ID','Id','Client_ID','ClientEventID'])).trim();
  out.Title = String(announcementField_(out, ['Title','Announcement_Title','Subject','Heading','Alert_Title'])).trim();
  out.Body = String(announcementField_(out, ['Body','Message','Description','Announcement','Details','Content','Text'])).trim();
  out.Barangay = String(announcementField_(out, ['Barangay','Target_Barangay','Target Barangay','Target','Scope']) || 'All Barangays').trim();
  out.Valid_Until = announcementField_(out, ['Valid_Until','ValidUntil','Valid Until','Expiry_Date','Expires_At','Expiry']);
  out.Published_At = announcementField_(out, ['Published_At','PublishedAt','Published At','Created_At','CreatedAt','Timestamp','Date']);
  out.Created_By = String(announcementField_(out, ['Created_By','CreatedBy','Author','Username','Created By'])).trim();
  out.Created_By_Role = String(announcementField_(out, ['Created_By_Role','CreatedByRole','Author_Role','Role','Created By Role']) || 'admin').trim().toLowerCase();

  let rawActive = announcementField_(out, ['Active','Is_Active','IsActive','Published_Active']);
  if (rawActive === '' || rawActive === null || rawActive === undefined) {
    const legacyStatus = String(announcementField_(out, ['Publish_Status','Status','Publication_Status']) || '').trim().toLowerCase();
    if (['inactive','unpublished','draft','disabled','expired','false','0','no'].indexOf(legacyStatus) !== -1) rawActive = false;
    else if (['active','published','on','enabled','true','1','yes'].indexOf(legacyStatus) !== -1) rawActive = true;
  }
  out.Active = (out.Title && out.Body) ? announcementActiveValue_(rawActive, true) : false;
  return out;
}
function announcementSortTime_(a) {
  const value = a && a.Published_At;
  const t = value ? new Date(value).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

function announcementStatusReason_(announcement, nowMs) {
  if (!announcement || !String(announcement.Title || '').trim() || !String(announcement.Body || '').trim()) return 'missing title or body';
  if (!announcementActiveValue_(announcement.Active, true)) return 'Active is false / inactive';
  const validUntil = announcement.Valid_Until || '';
  if (validUntil !== '' && validUntil !== null && validUntil !== undefined) {
    const expiryMs = announcementExpiryMs_(validUntil);
    if (expiryMs !== null && expiryMs < (nowMs || Date.now())) return 'Valid Until has passed';
  }
  return 'visible';
}

function announcementIsCurrent_(announcement, nowMs) {
  return announcementStatusReason_(announcement, nowMs) === 'visible';
}

// Read announcement rows by scanning the original header row and every column.
// This is deliberately separate from getData_(), whose object index can hide an
// earlier non-empty column when a legacy sheet contains duplicate header names.
function readAnnouncementRowsRobust_() {
  const sheet = getSheet_(APP.SHEETS.ANNOUNCEMENTS);
  ensureAnnouncementSheetSchema_(sheet);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return {headers:[], records:[], rowCount:0};

  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0].map(function(h){ return String(h === null || h === undefined ? '' : h).trim(); });
  const headerKeys = headers.map(function(h){ return String(h).toLowerCase().replace(/[^a-z0-9]/g, ''); });
  const rows = values.slice(1);
  const aliases = {
    Announcement_ID:['Announcement_ID','AnnouncementID','ID','Id','Client_ID','ClientEventID'],
    Type:['Type','Announcement_Type','Alert_Type','Category'],
    Priority:['Priority','Urgency','Severity'],
    Title:['Title','Announcement_Title','Subject','Heading','Alert_Title'],
    Barangay:['Barangay','Target_Barangay','Target Barangay','Target','Scope'],
    Body:['Body','Message','Description','Announcement','Details','Content','Text'],
    Valid_Until:['Valid_Until','ValidUntil','Valid Until','Expiry_Date','Expires_At','Expiry'],
    Published_At:['Published_At','PublishedAt','Published At','Created_At','CreatedAt','Timestamp','Date'],
    Active:['Active','Is_Active','IsActive','Published_Active'],
    Created_By:['Created_By','CreatedBy','Author','Username','Created By'],
    Created_By_Role:['Created_By_Role','CreatedByRole','Author_Role','Role','Created By Role'],
    Updated_At:['Updated_At','UpdatedAt','Updated At','Modified_At']
  };
  function isBlank(v) { return v === '' || v === null || v === undefined; }
  function pick(row, fieldAliases) {
    for (let a = 0; a < fieldAliases.length; a++) {
      const key = String(fieldAliases[a]).toLowerCase().replace(/[^a-z0-9]/g, '');
      // For duplicate versions of the same header, prefer the rightmost non-empty cell.
      for (let c = headerKeys.length - 1; c >= 0; c--) {
        if (headerKeys[c] === key && !isBlank(row[c])) return row[c];
      }
    }
    return '';
  }
  const records = rows.map(function(row, idx) {
    const raw = {};
    Object.keys(aliases).forEach(function(field){ raw[field] = pick(row, aliases[field]); });
    const status = String(pick(row, ['Publish_Status','Publication_Status','Status']) || '').trim().toLowerCase();
    if (isBlank(raw.Active)) {
      if (['inactive','unpublished','draft','disabled','expired','false','0','no'].indexOf(status) !== -1) raw.Active = false;
      else if (['active','published','on','enabled','true','1','yes'].indexOf(status) !== -1) raw.Active = true;
    }
    raw.Barangay = String(raw.Barangay || 'All Barangays').trim();
    const normalized = normalizeAnnouncementRecord_(raw);
    normalized.__sheetRow = idx + 2;
    return normalized;
  }).filter(function(a) {
    return !!(a.Announcement_ID || a.Title || a.Body || a.Created_By || a.Published_At);
  });
  return {headers:headers, records:records, rowCount:rows.length};
}

function getAnnouncementFeedSnapshot_() {
  const source = readAnnouncementRowsRobust_();
  const now = Date.now();
  const all = source.records;
  const evaluated = all.map(function(a) { return {announcement:a, reason:announcementStatusReason_(a, now)}; });
  const visible = evaluated.filter(function(x){ return x.reason === 'visible'; })
    .map(function(x){ return x.announcement; })
    .sort(function(a,b){ return announcementSortTime_(b) - announcementSortTime_(a); });
  const diagnostics = {
    backendVersion: APP.VERSION,
    sheetName: APP.SHEETS.ANNOUNCEMENTS,
    totalRows: source.rowCount,
    rowsWithTitleAndBody: all.filter(function(a){ return !!(String(a.Title || '').trim() && String(a.Body || '').trim()); }).length,
    activeRows: all.filter(function(a){ return announcementActiveValue_(a.Active, true); }).length,
    expiredRows: evaluated.filter(function(x){ return x.reason === 'Valid Until has passed'; }).length,
    inactiveRows: evaluated.filter(function(x){ return x.reason === 'Active is false / inactive'; }).length,
    invalidRows: evaluated.filter(function(x){ return x.reason === 'missing title or body'; }).length,
    returnedRows: visible.length,
    sourceHeaders: source.headers.slice(0, 40),
    filteredExamples: evaluated.filter(function(x){ return x.reason !== 'visible'; }).slice(-10).map(function(x){
      return {id:x.announcement.Announcement_ID || '',title:x.announcement.Title || '',barangay:x.announcement.Barangay || '',active:x.announcement.Active,reason:x.reason};
    })
  };
  return {all:all, evaluated:evaluated, visible:visible, diagnostics:diagnostics};
}

function getAnnouncements_(r) {
  const liveUser = requireRole_(r, ['admin','bhw']);
  const snapshot = getAnnouncementFeedSnapshot_();
  let rows = r.activeOnly === false ? snapshot.all.slice() : snapshot.visible.slice();
  if (String(liveUser.Role || '').trim().toLowerCase() === 'bhw') {
    rows = rows.filter(function(a){ return announcementBarangayMatches_(a.Barangay, liveUser.Barangay); });
  }
  rows.sort(function(a,b){ return announcementSortTime_(b) - announcementSortTime_(a); });
  return {ok:true, backendVersion:APP.VERSION,
    diagnostics:Object.assign({}, snapshot.diagnostics, {returnedToUser:rows.length}),
    announcements:rows};
}

function getPublicAnnouncements_() {
  const snapshot = getAnnouncementFeedSnapshot_();
  return {ok:true, backendVersion:APP.VERSION, diagnostics:snapshot.diagnostics, announcements:snapshot.visible};
}

function getAnnouncementDiagnostics_(r) {
  const liveUser = requireRole_(r, ['admin','bhw']);
  const snapshot = getAnnouncementFeedSnapshot_();
  const isBhw = String(liveUser.Role || '').trim().toLowerCase() === 'bhw';
  const entries = snapshot.evaluated.filter(function(entry) {
    return !isBhw || announcementBarangayMatches_(entry.announcement.Barangay, liveUser.Barangay);
  }).slice(-40).map(function(entry) {
    const a = entry.announcement;
    return {id:a.Announcement_ID, title:a.Title, barangay:a.Barangay, row:a.__sheetRow || '',
      active:a.Active, validUntil:a.Valid_Until || '', visible:entry.reason === 'visible', reason:entry.reason};
  });
  return {ok:true, backendVersion:APP.VERSION, userRole:String(liveUser.Role || '').toLowerCase(),
    userBarangay:liveUser.Barangay || '',
    diagnostics:Object.assign({}, snapshot.diagnostics, {returnedToUser:entries.filter(function(x){return x.visible;}).length}),
    entries:entries};
}
function announcementExpiryMs_(value) {
  if (value === '' || value === null || value === undefined) return null;
  let dateOnly = '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    dateOnly = Utilities.formatDate(value, APP.TIMEZONE || 'Asia/Manila', 'yyyy-MM-dd');
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 100000000000) return value; // Unix milliseconds
    if (value > 0 && value < 100000) {
      const serialDate = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
      dateOnly = Utilities.formatDate(serialDate, APP.TIMEZONE || 'Asia/Manila', 'yyyy-MM-dd');
    } else return null;
  } else {
    const raw = String(value).trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00(?::00(?:\.000)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
    if (match) dateOnly = raw.substring(0, 10);
    else {
      const parsed = new Date(raw).getTime();
      return isNaN(parsed) ? null : parsed;
    }
  }
  if (dateOnly) {
    const endOfLocalDay = new Date(dateOnly + 'T23:59:59.999+08:00').getTime();
    return isNaN(endOfLocalDay) ? null : endOfLocalDay;
  }
  return null;
}function announcementObjectToRow_(obj, index, width, existingRow) {
  const maxMapped = Object.keys(index || {}).reduce(function(max, key) {
    return Math.max(max, Number(index[key]) + 1);
  }, 0);
  const length = Math.max(Number(width || 0), maxMapped, existingRow ? existingRow.length : 0);
  const row = new Array(length).fill('');
  if (existingRow) {
    for (let i = 0; i < Math.min(existingRow.length, length); i++) row[i] = existingRow[i];
  }
  Object.keys(obj || {}).forEach(function(key) {
    const column = index[key];
    if (typeof column === 'number' && column >= 0) row[column] = obj[key] === undefined || obj[key] === null ? '' : obj[key];
  });
  return row;
}

function saveAnnouncement_(r) {
  requireRole_(r, ['admin','bhw']);

  const a = r.announcement || {};
  const role = String((r.user && r.user.Role) || '').trim().toLowerCase();
  let barangay = String(a.Barangay || a.barangay || 'All Barangays').trim();

  if (role === 'bhw') {
    barangay = String(r.user.Barangay || '').trim();
  }

  if (role === 'admin' && barangay !== 'All Barangays' &&
      APP.BARANGAYS.indexOf(barangay) === -1) {
    throw new Error('Invalid target barangay.');
  }

  const id = String(a.Announcement_ID || a.id || '') || uuid_();

  const obj = {
    Announcement_ID:id,
    Type:String(a.Type || a.type || 'info'),
    Priority:String(a.Priority || a.priority || 'Normal'),
    Title:String(a.Title || a.title || '').trim(),
    Barangay:barangay,
    Body:String(a.Body || a.body || '').trim(),
    Valid_Until:a.Valid_Until || a.validUntil || '',
    Published_At:a.Published_At || a.publishedAt || now_(),
    Active:announcementActiveValue_(a.Active !== undefined ? a.Active : a.active, true),
    Created_By:r.user.Username,
    Created_By_Role:role,
    Updated_At:now_()
  };

  if (!obj.Title || !obj.Body) {
    throw new Error('Announcement title and body are required.');
  }

  const sh = getSheet_(APP.SHEETS.ANNOUNCEMENTS);
  ensureAnnouncementSheetSchema_(sh);
  const data = getData_(sh);
  const found = findRowById_(data, id, 'Announcement_ID');

  if (found) {
    const old = data.rows[found.row];
    if (role === 'bhw') {
      const oldObj = rowToObject_(old, data.index);
      const sameOwner = String(oldObj.Created_By || '').trim().toLowerCase() === String(r.user.Username || '').trim().toLowerCase();
      const sameBarangay = String(oldObj.Barangay || '').trim() === String(r.user.Barangay || '').trim();
      if (!sameOwner || !sameBarangay) throw new Error('BHW can edit only their own barangay announcements.');
    }
    obj.Published_At = old[data.index.Published_At] || obj.Published_At;
    const width = Math.max(sh.getLastColumn(), old.length, Object.keys(data.index).reduce(function(max, key){ return Math.max(max, Number(data.index[key]) + 1); }, 0));
    const row = announcementObjectToRow_(obj, data.index, width, old);
    sh.getRange(found.row + 2, 1, 1, row.length).setValues([row]);
  } else {
    const width = Math.max(sh.getLastColumn(), Object.keys(data.index).reduce(function(max, key){ return Math.max(max, Number(data.index[key]) + 1); }, 0));
    sh.appendRow(announcementObjectToRow_(obj, data.index, width, null));
  }

  SpreadsheetApp.flush();
  const verify = getData_(sh);
  const savedFound = findRowById_(verify, id, 'Announcement_ID');
  if (!savedFound) throw new Error('Announcement was not written to the Google Sheet.');
  const savedObj = normalizeAnnouncementRecord_(rowToObject_(verify.rows[savedFound.row], verify.index));

  logAudit_(r.user.User_ID, r.user.Username, r.user.Role,
    found ? 'UPDATE_ANNOUNCEMENT' : 'CREATE_ANNOUNCEMENT',
    'Announcements', id, obj.Title);

  return {ok:true, announcement:savedObj, persisted:true, backendVersion:APP.VERSION};
}

function deleteAnnouncement_(r) {
  requireRole_(r, ['admin','bhw']);

  const id = String(r.announcementId || '').trim();
  if (!id) throw new Error('Announcement ID is required.');

  const sh = getSheet_(APP.SHEETS.ANNOUNCEMENTS);
  ensureAnnouncementSheetSchema_(sh);
  const data = getData_(sh);
  const found = findRowById_(data, id, 'Announcement_ID');

  if (!found) return {ok:true, action:'already_deleted', persisted:true};

  const target = rowToObject_(data.rows[found.row], data.index);
  if (String(r.user.Role).toLowerCase() === 'bhw') {
    const sameOwner = String(target.Created_By || '').trim().toLowerCase() === String(r.user.Username || '').trim().toLowerCase();
    const sameBarangay = String(target.Barangay || '').trim() === String(r.user.Barangay || '').trim();
    if (!sameOwner || !sameBarangay) {
      throw new Error('BHW can delete only their own barangay announcements.');
    }
  }

  sh.deleteRow(found.row + 2);
  SpreadsheetApp.flush();

  logAudit_(r.user.User_ID, r.user.Username, r.user.Role,
    'DELETE_ANNOUNCEMENT', 'Announcements', id, target.Title || '');

  return {ok:true, deleted:true, persisted:true};
}


/* ======================================================
   HEALTH FACILITIES MONITORING & ALERT
   These records are intentionally separate from the shared/public Announcements feed.
   ====================================================== */

function ensureHealthFacilitySheets_() {
  const ss = getDatabaseSpreadsheet_();
  ensureSheet_(ss, APP.SHEETS.FACILITY_REPORTS, HEADERS.HealthFacilityReports);
  ensureSheet_(ss, APP.SHEETS.FACILITY_REPORT_HISTORY, HEADERS.HealthFacilityReportHistory);
  // Refresh request-local handles after creating any new sheets.
  REQUEST_SHEETS_[APP.SHEETS.FACILITY_REPORTS] = ss.getSheetByName(APP.SHEETS.FACILITY_REPORTS);
  REQUEST_SHEETS_[APP.SHEETS.FACILITY_REPORT_HISTORY] = ss.getSheetByName(APP.SHEETS.FACILITY_REPORT_HISTORY);
}

function facilityReportToObject_(rowObj) {
  const x = rowObj || {};
  return {
    Report_ID:String(x.Report_ID || ''),
    Client_Event_ID:String(x.Client_Event_ID || ''),
    Barangay:String(x.Barangay || ''),
    Facility_Name:String(x.Facility_Name || ''),
    Category:String(x.Category || ''),
    Priority:String(x.Priority || 'Normal'),
    Title:String(x.Title || ''),
    Description:String(x.Description || ''),
    Reporting_BHW_ID:String(x.Reporting_BHW_ID || ''),
    Reporting_BHW_Name:String(x.Reporting_BHW_Name || ''),
    Reporting_BHW_Username:String(x.Reporting_BHW_Username || ''),
    Submitted_At:x.Submitted_At || '',
    Status:String(x.Status || 'New'),
    Admin_Remarks:String(x.Admin_Remarks || ''),
    Acknowledged_At:x.Acknowledged_At || '',
    In_Progress_At:x.In_Progress_At || '',
    Resolved_At:x.Resolved_At || '',
    Updated_At:x.Updated_At || '',
    history:[]
  };
}

function appendFacilityHistory_(historySheet, reportId, action, fromStatus, toStatus, remarks, actor) {
  const liveActor = actor || {};
  historySheet.appendRow([
    uuid_(), String(reportId || ''), String(action || ''), String(fromStatus || ''),
    String(toStatus || ''), String(remarks || ''), String(liveActor.User_ID || ''),
    String(liveActor.Username || ''), String(liveActor.Role || ''), now_()
  ]);
}

function getHealthFacilityReportSummary_(r) {
  requireRole_(r, ['admin']);
  ensureHealthFacilitySheets_();
  const data = getData_(getSheet_(APP.SHEETS.FACILITY_REPORTS));
  const reports = data.rows.map(function(row){ return facilityReportToObject_(rowToObject_(row, data.index)); })
    .filter(function(report){ return !!report.Report_ID; });
  const openReports = reports.filter(function(report){ return report.Status !== 'Resolved'; });
  return {
    ok:true,
    totalReports:reports.length,
    newReports:reports.filter(function(report){ return report.Status === 'New'; }).length,
    highReports:openReports.filter(function(report){ return report.Priority === 'High'; }).length,
    urgentReports:openReports.filter(function(report){ return report.Priority === 'Urgent'; }).length,
    generatedAt:now_()
  };
}

function getHealthFacilityReports_(r) {
  requireRole_(r, ['admin']);
  ensureHealthFacilitySheets_();
  const reportData = getData_(getSheet_(APP.SHEETS.FACILITY_REPORTS));
  const historyData = getData_(getSheet_(APP.SHEETS.FACILITY_REPORT_HISTORY));
  const historyByReport = {};
  historyData.rows.forEach(function(row) {
    const h = rowToObject_(row, historyData.index);
    const id = String(h.Report_ID || '');
    if (!id) return;
    if (!historyByReport[id]) historyByReport[id] = [];
    historyByReport[id].push({
      History_ID:String(h.History_ID || ''), Action:String(h.Action || ''),
      From_Status:String(h.From_Status || ''), To_Status:String(h.To_Status || ''),
      Remarks:String(h.Remarks || ''), Changed_By_Username:String(h.Changed_By_Username || ''),
      Changed_By_Role:String(h.Changed_By_Role || ''), Changed_At:h.Changed_At || ''
    });
  });
  const reports = reportData.rows.map(function(row) {
    const report = facilityReportToObject_(rowToObject_(row, reportData.index));
    report.history = (historyByReport[report.Report_ID] || []).sort(function(a,b) {
      return String(a.Changed_At || '').localeCompare(String(b.Changed_At || ''));
    });
    return report;
  }).filter(function(report) { return !!report.Report_ID; });
  reports.sort(function(a,b) { return String(b.Submitted_At || '').localeCompare(String(a.Submitted_At || '')); });
  return {ok:true,reports:reports,generatedAt:now_()};
}

function saveHealthFacilityReport_(r) {
  const actor = requireRole_(r, ['bhw']);
  ensureHealthFacilitySheets_();
  const payload = r.report || {};
  const allowedCategories = ['Medical Supplies','Equipment','Staffing','Facility Condition','Utilities','Urgent Health Facility Concern','General Request'];
  const allowedPriorities = ['Low','Normal','High','Urgent'];
  // Facility label is assigned by the server from the authenticated BHW's barangay;
  // never trust a user-supplied facility name that could point at another barangay.
  const assignedBarangay = String(actor.Barangay || '').trim();
  if (APP.BARANGAYS.indexOf(assignedBarangay) === -1) throw new Error('Your account does not have a valid assigned barangay.');
  const facilityName = assignedBarangay + ' Health Facility';
  const category = String(payload.Category || payload.category || '').trim();
  const priority = String(payload.Priority || payload.priority || 'Normal').trim();
  const title = String(payload.Title || payload.title || '').trim().slice(0,180);
  const description = String(payload.Description || payload.description || '').trim().slice(0,5000);
  const clientEventId = String(payload.Client_Event_ID || payload.clientEventId || '').trim().slice(0,100);
  if (!clientEventId) throw new Error('Submission ID is required. Please retry from the open report form.');
  if (!facilityName || !category || !title || !description) throw new Error('Facility, category, title and description are required.');
  if (allowedCategories.indexOf(category) === -1) throw new Error('Invalid health facility report category.');
  if (allowedPriorities.indexOf(priority) === -1) throw new Error('Invalid health facility report priority.');
  if (description.length < 5) throw new Error('Please provide a little more detail about the concern.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_(APP.SHEETS.FACILITY_REPORTS);
    const data = getData_(sheet);
    const eventIdx = data.index.Client_Event_ID;
    if (eventIdx !== undefined) {
      for (let i=0; i<data.rows.length; i++) {
        if (String(data.rows[i][eventIdx] || '') === clientEventId) {
          const existing = facilityReportToObject_(rowToObject_(data.rows[i], data.index));
          return {ok:true,report:existing,persisted:true,duplicate:true};
        }
      }
    }
    const now = now_();
    const reportId = uuid_();
    const rowObj = {
      Report_ID:reportId, Client_Event_ID:clientEventId,
      Barangay:String(actor.Barangay || '').trim(), Facility_Name:facilityName,
      Category:category, Priority:priority, Title:title, Description:description,
      Reporting_BHW_ID:String(actor.User_ID || ''), Reporting_BHW_Name:String(actor.Full_Name || ''),
      Reporting_BHW_Username:String(actor.Username || ''), Submitted_At:now, Status:'New',
      Admin_Remarks:'', Acknowledged_At:'', In_Progress_At:'', Resolved_At:'', Updated_At:now
    };
    const row = objectToRow_(rowObj, data.index);
    sheet.getRange(sheet.getLastRow()+1,1,1,row.length).setValues([row]);
    const verify = getData_(sheet);
    const found = findRowById_(verify, reportId, 'Report_ID');
    if (!found) throw new Error('Facility report was not confirmed in Google Sheets. Do not create a new submission; retry using this form.');
    appendFacilityHistory_(getSheet_(APP.SHEETS.FACILITY_REPORT_HISTORY), reportId, 'SUBMITTED', '', 'New', 'BHW submitted a health facility concern.', actor);
    SpreadsheetApp.flush();
    logAudit_(actor.User_ID, actor.Username, actor.Role, 'CREATE_HEALTH_FACILITY_REPORT', APP.SHEETS.FACILITY_REPORTS, reportId, title);
    return {ok:true,report:facilityReportToObject_(rowToObject_(verify.rows[found.row], verify.index)),persisted:true,duplicate:false};
  } finally {
    lock.releaseLock();
  }
}

function updateHealthFacilityReport_(r) {
  const actor = requireRole_(r, ['admin']);
  ensureHealthFacilitySheets_();
  const reportId = String(r.reportId || '').trim();
  const newStatus = String(r.status || '').trim();
  const remarks = String(r.remarks || '').trim().slice(0,3000);
  const allowedStatuses = ['New','Acknowledged','In Progress','Resolved'];
  if (!reportId) throw new Error('Facility report ID is required.');
  if (allowedStatuses.indexOf(newStatus) === -1) throw new Error('Invalid report status.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_(APP.SHEETS.FACILITY_REPORTS);
    const data = getData_(sheet);
    const found = findRowById_(data, reportId, 'Report_ID');
    if (!found) throw new Error('Health facility report not found.');
    const oldObj = rowToObject_(data.rows[found.row], data.index);
    const oldStatus = String(oldObj.Status || 'New');
    const oldRemarks = String(oldObj.Admin_Remarks || '');
    const now = now_();
    const updated = Object.assign({}, oldObj, {Status:newStatus,Admin_Remarks:remarks,Updated_At:now});
    if (newStatus === 'Acknowledged' && !oldObj.Acknowledged_At) updated.Acknowledged_At = now;
    if (newStatus === 'In Progress' && !oldObj.In_Progress_At) updated.In_Progress_At = now;
    if (newStatus === 'Resolved' && !oldObj.Resolved_At) updated.Resolved_At = now;
    if (newStatus !== 'Resolved') updated.Resolved_At = '';
    if (newStatus !== 'Acknowledged' && !oldObj.Acknowledged_At) updated.Acknowledged_At = '';
    if (newStatus !== 'In Progress' && !oldObj.In_Progress_At) updated.In_Progress_At = '';
    const row = objectToRow_(updated, data.index);
    sheet.getRange(found.row+2,1,1,row.length).setValues([row]);
    if (newStatus !== oldStatus) {
      appendFacilityHistory_(getSheet_(APP.SHEETS.FACILITY_REPORT_HISTORY), reportId, 'STATUS_CHANGED', oldStatus, newStatus, remarks, actor);
    } else if (remarks !== oldRemarks) {
      appendFacilityHistory_(getSheet_(APP.SHEETS.FACILITY_REPORT_HISTORY), reportId, 'ADMIN_RESPONSE_UPDATED', oldStatus, oldStatus, remarks, actor);
    }
    SpreadsheetApp.flush();
    logAudit_(actor.User_ID, actor.Username, actor.Role, 'UPDATE_HEALTH_FACILITY_REPORT', APP.SHEETS.FACILITY_REPORTS, reportId, oldStatus + ' -> ' + newStatus);
    const verified = getData_(sheet);
    const reloaded = findRowById_(verified, reportId, 'Report_ID');
    if (!reloaded) throw new Error('Updated facility report could not be re-read from Google Sheets.');
    return {ok:true,report:facilityReportToObject_(rowToObject_(verified.rows[reloaded.row], verified.index)),persisted:true};
  } finally {
    lock.releaseLock();
  }
}


/* ======================================================
   INVENTORY
   ====================================================== */

function getInventory_(r) {
  requireRole_(r, ['admin','bhw']);
  // Read path: INITIALIZE_SYSTEM creates these sheets; no header verification or
  // insert checks are needed on every inventory view request. Write actions still
  // call ensureInventorySheets_().
  const data = getData_(getSheet_(APP.SHEETS.INVENTORY));
  let rows = data.rows.map(function(row){ return rowToObject_(row, data.index); });
  if (r.user.Role === 'bhw') rows = rows.filter(function(x){ return x.Barangay === r.user.Barangay; });
  else if (r.barangay && String(r.barangay).toUpperCase() !== 'ALL') rows = rows.filter(function(x){ return x.Barangay === r.barangay; });

  // Hide only true exact duplicate rows from dashboard responses.
  // Rows with different quantities are left visible until an administrator reviews them.
  const seen = {};
  rows = rows.filter(function(x) {
    const isCentral = String(x.Barangay || '') === CENTRAL_STOCK_LOCATION;
    if (!isCentral) return true;
    const key = [
      String(x.Category || '').trim().toLowerCase(),
      String(x.Item_Name || '').trim().toLowerCase(),
      String(x.Unit || '').trim().toLowerCase(),
      Number(x.Current_Stock || 0),
      Number(x.Reorder_Level || 0),
      Number(x.Released || 0)
    ].join('|');
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });

  return {ok:true, inventory:rows};
}

const CENTRAL_STOCK_LOCATION = 'CITY CENTRAL STOCK';

function ensureInventorySheets_() {
  const ss = getDatabaseSpreadsheet_();
  ensureSheet_(ss, APP.SHEETS.INVENTORY, HEADERS.Inventory);
  ensureSheet_(ss, APP.SHEETS.INVENTORY_TRANSACTIONS, HEADERS.InventoryTransactions);
  ensureSheet_(ss, APP.SHEETS.INVENTORY_RELEASES, HEADERS.InventoryReleases);
  return ss;
}

function saveInventory_(r) {
  requireRole_(r, ['admin']);
  ensureInventorySheets_();

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error('Another inventory update is in progress. Please wait a moment and try again.');
  }

  try {
    const i = r.inventory || {};
    const clientEventId = String(i.clientEventId || i.Client_Event_ID || '').trim();
    if (clientEventId) {
      const cached = CacheService.getScriptCache().get('INV_SAVE_' + clientEventId);
      if (cached) {
        try { return JSON.parse(cached); } catch (e) {}
      }
    }

    const requestedBarangay = String(i.Barangay || i.barangay || CENTRAL_STOCK_LOCATION).trim();
    if (requestedBarangay !== CENTRAL_STOCK_LOCATION) {
      throw new Error('New inventory must be added to the Central Warehouse first. Use Distribute Stock to send supplies to a barangay.');
    }

    const editingId = String(i.Inventory_ID || i.id || '').trim();
    const incomingStock = Number(i.Current_Stock ?? i.stock ?? 0);
    const incomingReorder = Number(i.Reorder_Level ?? i.reorder ?? 0);
    const category = String(i.Category || i.category || 'Other').trim();
    const itemName = String(i.Item_Name || i.name || '').trim();
    const unit = String(i.Unit || i.unit || '').trim();

    if (!itemName || !unit) throw new Error('Item name and unit are required.');
    if (!Number.isFinite(incomingStock) || incomingStock < 0 || !Number.isFinite(incomingReorder) || incomingReorder < 0) {
      throw new Error('Stock and reorder level cannot be negative.');
    }

    const sh = getSheet_(APP.SHEETS.INVENTORY);
    const data = getData_(sh);

    let found = null;
    let merged = false;

    // Edit: update the selected row exactly.
    if (editingId) {
      found = findRowById_(data, editingId, 'Inventory_ID');
      if (!found) throw new Error('The selected inventory item no longer exists. Refresh and try again.');
      const old = rowToObject_(data.rows[found.row], data.index);
      if (old.Barangay !== CENTRAL_STOCK_LOCATION) {
        throw new Error('Barangay stock cannot be edited directly. Use Distribute Stock.');
      }

      const obj = {
        Inventory_ID: old.Inventory_ID,
        Barangay: CENTRAL_STOCK_LOCATION,
        Category: category,
        Item_Name: itemName,
        Unit: unit,
        Current_Stock: incomingStock,
        Reorder_Level: incomingReorder,
        Released: Number(old.Released || 0),
        Updated_By: r.user.Username,
        Updated_At: now_()
      };

      sh.getRange(found.row + 2, 1, 1, Object.keys(data.index).length)
        .setValues([objectToRow_(obj, data.index)]);

      SpreadsheetApp.flush();
      const verify = getData_(sh);
      const verified = findRowById_(verify, obj.Inventory_ID, 'Inventory_ID');
      if (!verified) throw new Error('Central stock edit could not be verified in the Inventory sheet.');

      const persistedObj = rowToObject_(verify.rows[verified.row], verify.index);
      logAudit_(r.user.User_ID, r.user.Username, r.user.Role,
        'UPDATE_CENTRAL_INVENTORY', 'Inventory', obj.Inventory_ID, obj.Item_Name);

      const response = {ok:true, inventory:persistedObj, persisted:true, merged:false};
      if (clientEventId) CacheService.getScriptCache().put('INV_SAVE_' + clientEventId, JSON.stringify(response), 21600);
      return response;
    }

    // Add stock: exact same item is consolidated into the existing Central Warehouse row.
    const categoryKey = category.toLowerCase();
    const nameKey = itemName.toLowerCase();
    const unitKey = unit.toLowerCase();

    for (let idx = 0; idx < data.rows.length; idx++) {
      const rowObj = rowToObject_(data.rows[idx], data.index);
      if (
        String(rowObj.Barangay || '') === CENTRAL_STOCK_LOCATION &&
        String(rowObj.Category || '').trim().toLowerCase() === categoryKey &&
        String(rowObj.Item_Name || '').trim().toLowerCase() === nameKey &&
        String(rowObj.Unit || '').trim().toLowerCase() === unitKey
      ) {
        found = {row: idx, obj: rowObj};
        break;
      }
    }

    let obj;
    if (found) {
      obj = found.obj;
      obj.Barangay = CENTRAL_STOCK_LOCATION;
      obj.Current_Stock = Number(obj.Current_Stock || 0) + incomingStock;
      obj.Reorder_Level = incomingReorder > 0 ? incomingReorder : Number(obj.Reorder_Level || 0);
      obj.Released = Number(obj.Released || 0);
      obj.Updated_By = r.user.Username;
      obj.Updated_At = now_();
      sh.getRange(found.row + 2, 1, 1, Object.keys(data.index).length)
        .setValues([objectToRow_(obj, data.index)]);
      merged = true;
    } else {
      obj = {
        Inventory_ID: uuid_(),
        Barangay: CENTRAL_STOCK_LOCATION,
        Category: category,
        Item_Name: itemName,
        Unit: unit,
        Current_Stock: incomingStock,
        Reorder_Level: incomingReorder,
        Released: 0,
        Updated_By: r.user.Username,
        Updated_At: now_()
      };
      sh.appendRow(objectToRow_(obj, data.index));
    }

    SpreadsheetApp.flush();

    // Defensive cleanup: collapse any other exact duplicate Central Warehouse rows
    // that may already exist from earlier versions, keeping one row with the summed stock.
    const fresh = getData_(sh);
    const duplicateRows = [];
    let canonicalRow = findRowById_(fresh, obj.Inventory_ID, 'Inventory_ID');
    if (!canonicalRow) {
      // For a merged item, locate the current row again by item signature.
      for (let idx = 0; idx < fresh.rows.length; idx++) {
        const ro = rowToObject_(fresh.rows[idx], fresh.index);
        if (String(ro.Barangay || '') === CENTRAL_STOCK_LOCATION &&
            String(ro.Category || '').trim().toLowerCase() === categoryKey &&
            String(ro.Item_Name || '').trim().toLowerCase() === nameKey &&
            String(ro.Unit || '').trim().toLowerCase() === unitKey) {
          canonicalRow = {row: idx};
          break;
        }
      }
    }

    let consolidatedStock = 0;
    let consolidatedReleased = 0;
    let maxReorder = 0;

    for (let idx = 0; idx < fresh.rows.length; idx++) {
      const ro = rowToObject_(fresh.rows[idx], fresh.index);
      const same = String(ro.Barangay || '') === CENTRAL_STOCK_LOCATION &&
        String(ro.Category || '').trim().toLowerCase() === categoryKey &&
        String(ro.Item_Name || '').trim().toLowerCase() === nameKey &&
        String(ro.Unit || '').trim().toLowerCase() === unitKey;
      if (!same) continue;
      consolidatedStock += Number(ro.Current_Stock || 0);
      consolidatedReleased += Number(ro.Released || 0);
      maxReorder = Math.max(maxReorder, Number(ro.Reorder_Level || 0));
      if (canonicalRow && idx !== canonicalRow.row) duplicateRows.push(idx);
    }

    if (duplicateRows.length && canonicalRow) {
      const canonicalObj = rowToObject_(fresh.rows[canonicalRow.row], fresh.index);
      canonicalObj.Current_Stock = consolidatedStock;
      canonicalObj.Released = consolidatedReleased;
      canonicalObj.Reorder_Level = maxReorder;
      canonicalObj.Updated_By = r.user.Username;
      canonicalObj.Updated_At = now_();

      sh.getRange(canonicalRow.row + 2, 1, 1, Object.keys(fresh.index).length)
        .setValues([objectToRow_(canonicalObj, fresh.index)]);

      duplicateRows.sort(function(a,b){ return b-a; }).forEach(function(rowIdx){
        sh.deleteRow(rowIdx + 2);
      });

      SpreadsheetApp.flush();
      obj = canonicalObj;
    }

    const verify = getData_(sh);
    const verified = findRowById_(verify, obj.Inventory_ID, 'Inventory_ID') ||
      (function(){
        for (let idx = 0; idx < verify.rows.length; idx++) {
          const ro = rowToObject_(verify.rows[idx], verify.index);
          if (String(ro.Barangay || '') === CENTRAL_STOCK_LOCATION &&
              String(ro.Category || '').trim().toLowerCase() === categoryKey &&
              String(ro.Item_Name || '').trim().toLowerCase() === nameKey &&
              String(ro.Unit || '').trim().toLowerCase() === unitKey) {
            return {row:idx};
          }
        }
        return null;
      })();

    if (!verified) throw new Error('Central stock save could not be verified in the Inventory sheet.');

    const persistedObj = rowToObject_(verify.rows[verified.row], verify.index);
    logAudit_(r.user.User_ID, r.user.Username, r.user.Role,
      merged ? 'RESTOCK_CENTRAL_INVENTORY' : 'CREATE_CENTRAL_INVENTORY',
      'Inventory', persistedObj.Inventory_ID, persistedObj.Item_Name);

    const response = {ok:true, inventory:persistedObj, persisted:true, merged:merged || duplicateRows.length > 0};
    if (clientEventId) CacheService.getScriptCache().put('INV_SAVE_' + clientEventId, JSON.stringify(response), 21600);
    return response;
  } finally {
    lock.releaseLock();
  }
}
function distributeInventory_(r) {
  requireRole_(r,['admin']);
  ensureInventorySheets_();
  const inventoryId=String(r.inventoryId||'').trim(), barangay=String(r.barangay||'').trim(), quantity=Number(r.quantity||0), notes=String(r.notes||'').trim();
  if(!inventoryId) throw new Error('Central inventory item is required.');
  if(APP.BARANGAYS.indexOf(barangay)===-1) throw new Error('Invalid target barangay.');
  if(!Number.isFinite(quantity)||quantity<=0) throw new Error('Distribution quantity must be greater than zero.');
  const sh=getSheet_(APP.SHEETS.INVENTORY), data=getData_(sh), sourceFound=findRowById_(data,inventoryId,'Inventory_ID');
  if(!sourceFound) throw new Error('Central stock item not found.');
  const source=rowToObject_(data.rows[sourceFound.row],data.index);
  if(source.Barangay!==CENTRAL_STOCK_LOCATION) throw new Error('Selected item is not in the Central Warehouse.');
  const sourceStock=Number(source.Current_Stock||0);
  if(quantity>sourceStock) throw new Error('Insufficient Central Warehouse stock. Available: '+sourceStock+' '+source.Unit+'.');
  let targetFound=null;
  for(let idx=0;idx<data.rows.length;idx++){
    const rowObj=rowToObject_(data.rows[idx],data.index);
    if(rowObj.Barangay===barangay && String(rowObj.Item_Name).trim().toLowerCase()===String(source.Item_Name).trim().toLowerCase() && String(rowObj.Unit).trim().toLowerCase()===String(source.Unit).trim().toLowerCase() && String(rowObj.Category).trim().toLowerCase()===String(source.Category).trim().toLowerCase()){
      targetFound={row:idx,obj:rowObj};break;
    }
  }
  const updatedAt=now_();
  source.Current_Stock=sourceStock-quantity;source.Released=Number(source.Released||0)+quantity;source.Updated_By=r.user.Username;source.Updated_At=updatedAt;
  sh.getRange(sourceFound.row+2,1,1,Object.keys(data.index).length).setValues([objectToRow_(source,data.index)]);
  let target;
  if(targetFound){
    target=targetFound.obj;target.Current_Stock=Number(target.Current_Stock||0)+quantity;target.Reorder_Level=Number(target.Reorder_Level||source.Reorder_Level||0);target.Updated_By=r.user.Username;target.Updated_At=updatedAt;
    sh.getRange(targetFound.row+2,1,1,Object.keys(data.index).length).setValues([objectToRow_(target,data.index)]);
  }else{
    target={Inventory_ID:uuid_(),Barangay:barangay,Category:source.Category,Item_Name:source.Item_Name,Unit:source.Unit,Current_Stock:quantity,Reorder_Level:Number(source.Reorder_Level||0),Released:0,Updated_By:r.user.Username,Updated_At:updatedAt};
    sh.appendRow(objectToRow_(target,data.index));
  }
  getSheet_(APP.SHEETS.INVENTORY_TRANSACTIONS).appendRow([uuid_(),updatedAt,source.Inventory_ID,source.Item_Name,CENTRAL_STOCK_LOCATION,barangay,quantity,source.Unit,r.user.Username,notes]);
  SpreadsheetApp.flush();
  logAudit_(r.user.User_ID,r.user.Username,r.user.Role,'DISTRIBUTE_INVENTORY','Inventory',source.Inventory_ID,quantity+' '+source.Unit+' -> '+barangay+(notes?' | '+notes:''));
  return {ok:true,central:source,target:target,persisted:true};
}


function releaseInventory_(r) {
  requireRole_(r, ['bhw']);
  ensureInventorySheets_();
  const inventoryId = String(r.inventoryId || '').trim();
  const quantity = Number(r.quantity || 0);
  const patientName = String(r.patientName || '').trim();
  const patientReportId = String(r.patientReportId || '').trim();
  const reason = String(r.reason || 'Patient use / treatment').trim();
  const notes = String(r.notes || '').trim();
  const clientEventId = String(r.clientEventId || '').trim();
  if (!inventoryId) throw new Error('Inventory item is required.');
  if (!patientName) throw new Error('Patient name is required for a stock release.');
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Release quantity must be greater than zero.');
  if (clientEventId) {
    const cached = CacheService.getScriptCache().get('INV_RELEASE_' + clientEventId);
    if (cached) { try { return JSON.parse(cached); } catch (e) {} }
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Another inventory update is in progress. Please try again.');
  try {
    const sh = getSheet_(APP.SHEETS.INVENTORY);
    const data = getData_(sh);
    const found = findRowById_(data, inventoryId, 'Inventory_ID');
    if (!found) throw new Error('Barangay inventory item not found.');
    const item = rowToObject_(data.rows[found.row], data.index);
    if (String(item.Barangay || '') !== String(r.user.Barangay || '')) throw new Error('You can only release stock from your assigned barangay.');
    const available = Number(item.Current_Stock || 0);
    if (quantity > available) throw new Error('Insufficient barangay stock. Available: ' + available + ' ' + item.Unit + '.');

    item.Current_Stock = available - quantity;
    item.Released = Number(item.Released || 0) + quantity;
    item.Updated_By = r.user.Username;
    item.Updated_At = now_();
    sh.getRange(found.row + 2, 1, 1, Object.keys(data.index).length).setValues([objectToRow_(item, data.index)]);

    const relSh = getSheet_(APP.SHEETS.INVENTORY_RELEASES);
    relSh.appendRow([
      uuid_(), item.Updated_At, item.Inventory_ID, item.Barangay, item.Item_Name,
      quantity, item.Unit, patientName, patientReportId, reason, r.user.Username, notes
    ]);

    // Keep the existing transaction ledger and add a readable patient-release entry.
    getSheet_(APP.SHEETS.INVENTORY_TRANSACTIONS).appendRow([
      uuid_(), item.Updated_At, item.Inventory_ID, item.Item_Name, item.Barangay,
      item.Barangay, quantity, item.Unit, r.user.Username,
      'RELEASE_TO_PATIENT | Patient: ' + patientName + (patientReportId ? ' | Report: ' + patientReportId : '') +
      ' | ' + reason + (notes ? ' | ' + notes : '')
    ]);
    // Avoid SpreadsheetApp.flush() and a second full-sheet reread here.
    // setValues()/appendRow() are synchronous writes; the updated item is already the
    // authoritative response sent back to the client. This removes the slowest part
    // of the release round-trip while retaining the transaction and audit trail.
    logAudit_(r.user.User_ID, r.user.Username, r.user.Role, 'RELEASE_INVENTORY_TO_PATIENT', 'Inventory', item.Inventory_ID,
      quantity + ' ' + item.Unit + ' to patient ' + patientName + ' at ' + item.Barangay);

    const response = {ok:true, inventory:item, release:{Patient_Name:patientName, Quantity:quantity, Unit:item.Unit, Barangay:item.Barangay}, persisted:true};
    if (clientEventId) CacheService.getScriptCache().put('INV_RELEASE_' + clientEventId, JSON.stringify(response), 21600);
    return response;
  } finally {
    lock.releaseLock();
  }
}

function deleteInventory_(r) {
  requireRole_(r,['admin']);
  ensureInventorySheets_();
  const id=String(r.inventoryId||''), sh=getSheet_(APP.SHEETS.INVENTORY), data=getData_(sh), found=findRowById_(data,id,'Inventory_ID');
  if(!found) return {ok:true,deleted:false,persisted:true};
  const item=rowToObject_(data.rows[found.row],data.index);
  if(item.Barangay!==CENTRAL_STOCK_LOCATION) throw new Error('Barangay stock cannot be deleted directly. Use the distribution workflow.');

  // Admin may delete a Central Warehouse item even when stock remains.
  // Only the current balance record is removed; InventoryTransactions and AuditLogs stay intact.
  sh.deleteRow(found.row+2);
  SpreadsheetApp.flush();
  logAudit_(r.user.User_ID,r.user.Username,r.user.Role,'DELETE_CENTRAL_INVENTORY','Inventory',id,
    item.Item_Name+' | deleted balance: '+Number(item.Current_Stock||0)+' '+String(item.Unit||''));
  return {ok:true,deleted:true,persisted:true};
}


/* ======================================================
   CONNECTIVITY / HEARTBEAT
   ====================================================== */

function heartbeat_(r) {
  const user = r.user;
  if (!user || user.Role !== 'bhw') {
    return {ok:true, status:'ignored'};
  }

  const deviceId = String(r.deviceId || user.Device_ID || '');
  const sh = getSheet_(APP.SHEETS.USERS);
  const data = getData_(sh);
  const found = findRowById_(data, user.User_ID, 'User_ID');

  const t = now_();

  if (found) {
    sh.getRange(found.row + 2, data.index.Last_Seen + 1).setValue(t);
    sh.getRange(found.row + 2, data.index.Device_ID + 1).setValue(deviceId);
    sh.getRange(found.row + 2, data.index.Updated_At + 1).setValue(t);
  }

  const csh = getSheet_(APP.SHEETS.CONNECTIVITY);
  const cdata = getData_(csh);
  const cfound = findRowById_(cdata, user.User_ID, 'User_ID');

  const row = [
    user.User_ID,
    user.Full_Name,
    user.Role,
    user.Barangay,
    deviceId,
    'Online',
    t,
    t
  ];

  if (cfound) {
    csh.getRange(cfound.row + 2,1,1,row.length).setValues([row]);
  } else {
    csh.appendRow(row);
  }

  return {ok:true,status:'Online',lastSeen:t};
}

function getConnectivity_(r) {
  requireRole_(r, ['admin','bhw']);

  const sh = getSheet_(APP.SHEETS.USERS);
  const data = getData_(sh);
  const now = new Date().getTime();

  let rows = data.rows
    .map(function(row){ return rowToObject_(row, data.index); })
    .filter(function(u){ return u.Role === 'bhw'; })
    .map(function(u){
      let status = 'Offline';

      if (u.Last_Seen) {
        const ageMin = (now - new Date(u.Last_Seen).getTime()) / 60000;

        if (ageMin <= APP.ONLINE_MINUTES) status = 'Online';
        else if (ageMin <= APP.PENDING_MINUTES) status = 'Pending';
      }

      return {
        User_ID:u.User_ID,
        Full_Name:u.Full_Name,
        Barangay:u.Barangay,
        Contact_Number:u.Contact_Number,
        Device_ID:u.Device_ID,
        Status:status,
        Last_Seen:u.Last_Seen || ''
      };
    });

  if (r.user.Role === 'bhw') {
    rows = rows.filter(function(x){ return x.Barangay === r.user.Barangay; });
  }

  return {ok:true, units:rows};
}


/* ======================================================
   HEAT INDEX
   ====================================================== */

function getHeatIndex_(r) {
  // Normal dashboard/public reads must remain fast. The external PAGASA page is
  // refreshed by the hourly trigger or by the explicit Refresh PAGASA Reference action.
  let referenceStation = null;
  try {
    const cached = CacheService.getScriptCache().get('TANAY_HEAT_REFERENCE_V1');
    referenceStation = cached ? JSON.parse(cached) : null;
  } catch (err) {}
  if (!referenceStation) referenceStation = getStoredTanayReference_();

  const sh = getSheet_(APP.SHEETS.HEAT);
  const data = getData_(sh);

  const rows = data.rows
    .map(function(row){ return rowToObject_(row, data.index); })
    .filter(function(x){ return APP.BARANGAYS.indexOf(String(x.Barangay || '')) !== -1; })
    .map(function(x){
      if (x.Heat_Index_C !== '' && x.Heat_Index_C !== null) {
        x.Heat_Index_C = Number(x.Heat_Index_C);
        x.Risk_Level = heatRisk_(x.Heat_Index_C);
      }
      return x;
    });

  return {
    ok:true,
    heatIndex:rows,
    referenceStation:referenceStation,
    source:APP.PAGASA.IHEATMAP_URL,
    sourceNote:'The official DOST-PAGASA iHeatMap is the authoritative location-based source. Tanay AWS is a nearby reference station only; it is not used as a per-barangay Antipolo reading.'
  };
}

function getStoredTanayReference_() {
  const sh = getSheet_(APP.SHEETS.HEAT);
  const data = getData_(sh);
  const row = data.rows.find(function(raw){ return String(raw[data.index.Barangay] || '') === 'CITY REFERENCE — TANAY AWS'; });
  if (!row) return null;
  const x = rowToObject_(row, data.index);
  const notes = String(x.Notes || '');
  const tm = notes.match(/Temp:\s*([0-9.]+)\s*C/i);
  const hm = notes.match(/RH:\s*([0-9.]+)\s*%/i);
  return {
    station:'Tanay, Rizal AWS',
    value:Number(x.Heat_Index_C),
    risk:x.Risk_Level || heatRisk_(Number(x.Heat_Index_C)),
    temperature:tm?Number(tm[1]):NaN,
    humidity:hm?Number(hm[1]):NaN,
    observedAt:x.Observed_At || '',
    source:x.Source || APP.PAGASA.AWS_URL,
    sourceUrl:x.Source_URL || APP.PAGASA.AWS_URL,
    referenceOnly:true
  };
}

function getLiveTanayReference_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('TANAY_HEAT_REFERENCE_V1');
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  const result = refreshPAGASAAWSReference_({
    internal:true,
    user:{User_ID:'SYSTEM',Username:'SYSTEM',Role:'admin',Barangay:'ALL'}
  });
  if (result && result.ok && result.reference) {
    const ref = {
      station:'Tanay, Rizal AWS',
      value:Number(result.reference.Heat_Index_C),
      risk:result.reference.Risk_Level,
      temperature:Number(result.stationData.temperature),
      humidity:Number(result.stationData.humidity),
      observedAt:String(result.stationData.updatedAt || result.reference.Observed_At || ''),
      source:result.reference.Source,
      sourceUrl:result.reference.Source_URL,
      referenceOnly:true
    };
    cache.put('TANAY_HEAT_REFERENCE_V1', JSON.stringify(ref), 600);
    return ref;
  }
  return getStoredTanayReference_();
}

function saveHeatIndex_(r) {
  requireRole_(r, ['admin']);

  const h = r.heatIndex || {};
  const barangay = String(h.Barangay || h.barangay || '');

  if (APP.BARANGAYS.indexOf(barangay) === -1) {
    throw new Error('Invalid barangay.');
  }

  const value = Number(h.Heat_Index_C ?? h.value);

  if (!isFinite(value)) {
    throw new Error('Valid heat index is required.');
  }

  const obj = {
    Heat_ID:String(h.Heat_ID || h.id || '') || uuid_(),
    Barangay:barangay,
    Heat_Index_C:value,
    Risk_Level:heatRisk_(value),
    Source:String(h.Source || 'PAGASA iHeatMap'),
    Source_URL:String(h.Source_URL || APP.PAGASA.IHEATMAP_URL),
    Reference_Station:String(h.Reference_Station || ''),
    Observed_At:h.Observed_At || now_(),
    Updated_At:now_(),
    Is_Live:Boolean(h.Is_Live ?? true),
    Notes:String(h.Notes || '')
  };

  const sh = getSheet_(APP.SHEETS.HEAT);
  const data = getData_(sh);
  const found = findRowById_(data, barangay, 'Barangay');

  if (found) {
    sh.getRange(found.row + 2,1,1,Object.keys(data.index).length)
      .setValues([objectToRow_(obj, data.index)]);
  } else {
    sh.appendRow(objectToRow_(obj, data.index));
  }

  logAudit_(r.user.User_ID, r.user.Username, r.user.Role,
    'SAVE_HEAT_INDEX', 'HeatIndex', barangay, String(value));

  return {ok:true, heatIndex:obj};
}


/**
 * Official PAGASA AWS reference connector.
 *
 * This function reads the public PAGASA AWS page and extracts the
 * Tanay, Rizal AWS temperature/humidity row when present.
 *
 * It DOES NOT pretend that Tanay is an exact reading for every
 * Antipolo barangay. It stores the result as a REFERENCE STATION
 * record. Per-barangay iHeatMap values can be entered later using
 * saveHeatIndex_ once an authorized machine-readable source is made
 * available.
 */
function refreshPAGASAAWSReference_(r) {
  const url = APP.PAGASA.AWS_URL;

  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions:true,
    followRedirects:true,
    headers:{'User-Agent':'Mozilla/5.0'}
  });

  const code = response.getResponseCode();
  const text = response.getContentText();

  if (code !== 200) {
    return {
      ok:false,
      status:code,
      message:'PAGASA AWS page could not be fetched.'
    };
  }

  const row = extractAWSRow_(text, 'Tanay, Rizal AWS');

  if (!row) {
    logAudit_('SYSTEM','SYSTEM','admin',
      'HEAT_REFERENCE_NOT_FOUND','HeatIndex','',
      'Tanay, Rizal AWS row not found on PAGASA page');

    return {
      ok:false,
      status:'not_found',
      source:url,
      message:'Tanay AWS row not found.'
    };
  }

  const temp = Number(row.temperature);
  const humidity = Number(row.humidity);

  const referenceHI = calculateHeatIndex_(temp, humidity);

  // Store as one special reference row; it is not assigned to an Antipolo barangay.
  const sh = getSheet_(APP.SHEETS.HEAT);
  const data = getData_(sh);

  const specialBarangay = 'CITY REFERENCE — TANAY AWS';

  const obj = {
    Heat_ID:'REFERENCE-TANAY-AWS',
    Barangay:specialBarangay,
    Heat_Index_C:referenceHI,
    Risk_Level:heatRisk_(referenceHI),
    Source:'PAGASA Automated Weather Station',
    Source_URL:url,
    Reference_Station:'Tanay, Rizal AWS',
    Observed_At:row.updatedAt || now_(),
    Updated_At:now_(),
    Is_Live:true,
    Notes:'Reference station only; not an exact heat index for individual Antipolo barangays. Temp: ' + temp.toFixed(1) + ' C | RH: ' + humidity.toFixed(0) + ' %'
  };

  const found = findRowById_(data, specialBarangay, 'Barangay');

  if (found) {
    sh.getRange(found.row + 2,1,1,Object.keys(data.index).length)
      .setValues([objectToRow_(obj, data.index)]);
  } else {
    sh.appendRow(objectToRow_(obj, data.index));
  }

  logAudit_('SYSTEM','SYSTEM','admin',
    'HEAT_REFERENCE_UPDATED','HeatIndex',specialBarangay,
    'Tanay AWS HI: ' + referenceHI);

  return {
    ok:true,
    reference:obj,
    stationData:row,
    warning:'This is a reference station reading, not a per-barangay Antipolo heat index.'
  };
}

function refreshPAGASAAWSReference_MENU() {
  const result = refreshPAGASAAWSReference_({
    internal:true,
    user:{User_ID:'SYSTEM',Username:'SYSTEM',Role:'admin',Barangay:'ALL'}
  });

  SpreadsheetApp.getUi().alert(JSON.stringify(result, null, 2));
}

function extractAWSRow_(html, stationName) {
  // The PAGASA page is an HTML table. This parser is intentionally defensive.
  const normalized = html
    .replace(/\r?\n/g,' ')
    .replace(/\s+/g,' ');

  const escaped = escapeRegExp_(stationName);

  // Look for a table-row style match around the station name.
  const pattern = new RegExp(
    '<tr[^>]*>.*?' + escaped + '.*?</tr>',
    'i'
  );

  const m = normalized.match(pattern);
  if (!m) return null;

  const cells = [];
  const cellRe = /<t[dh][^>]*>(.*?)<\/t[dh]>/gi;
  let c;

  while ((c = cellRe.exec(m[0])) !== null) {
    cells.push(stripHtml_(c[1]));
  }

  // Known table order:
  // Site ID | Site Name | Temp | Humidity | Wind... | Last Updated
  if (cells.length < 4) return null;

  const temperature = parseNumber_(cells[2]);
  const humidity = parseNumber_(cells[3]);
  const updatedAt = cells[cells.length - 1] || '';

  if (!isFinite(temperature) || !isFinite(humidity)) return null;

  return {
    station:cells[1] || stationName,
    temperature:temperature,
    humidity:humidity,
    updatedAt:updatedAt
  };
}

/**
 * Heat Index formula based on the Rothfusz regression.
 * Used only for station observations when both temperature and humidity exist.
 */
function calculateHeatIndex_(tempC, rh) {
  const T = (tempC * 9/5) + 32;
  const R = rh;

  let HI = 0.5 * (T + 61.0 + ((T - 68.0) * 1.2) + (R * 0.094));

  if (HI >= 80) {
    HI =
      -42.379 +
      2.04901523 * T +
      10.14333127 * R -
      0.22475541 * T * R -
      0.00683783 * T * T -
      0.05481717 * R * R +
      0.00122874 * T * T * R +
      0.00085282 * T * R * R -
      0.00000199 * T * T * R * R;

    if (R < 13 && T >= 80 && T <= 112) {
      HI -= ((13 - R) / 4) *
        Math.sqrt((17 - Math.abs(T - 95)) / 17);
    } else if (R > 85 && T >= 80 && T <= 87) {
      HI += ((R - 85) / 10) * ((87 - T) / 5);
    }
  }

  return Number((((HI - 32) * 5/9)).toFixed(1));
}

function heatRisk_(value) {
  value = Number(value);

  if (value >= 52) return 'Extreme Danger';
  if (value >= 42) return 'Danger';
  if (value >= 33) return 'Extreme Caution';
  if (value >= 27) return 'Caution';
  return 'Below Caution';
}


/* ======================================================
   DASHBOARD AGGREGATION
   ====================================================== */

function getDashboard_(r) {
  // Public dashboard remains lightweight and unauthenticated.
  if (!r || !r.user) return getPublicDashboard_();

  const liveUser = requireRole_(r, ['admin','bhw']);
  const usersData = r.__authUsersData || getData_(getSheet_(APP.SHEETS.USERS));

  const role = String(liveUser.Role || '').toLowerCase();
  const scopeBarangay = role === 'bhw'
    ? String(liveUser.Barangay || '')
    : (r.barangay && String(r.barangay).toLowerCase() !== 'all' ? String(r.barangay) : 'ALL');

  // PATIENTS — one read, scoped server-side.
  const patientData = getData_(getSheet_(APP.SHEETS.PATIENTS));
  let patients = patientData.rows.map(function(row){ return rowToObject_(row, patientData.index); });
  patients = applyCatalogNamesToPatients_(patients);
  if (role === 'bhw') patients = patients.filter(function(x){ return x.Barangay === scopeBarangay; });
  if (scopeBarangay !== 'ALL') patients = patients.filter(function(x){ return x.Barangay === scopeBarangay; });

  // HEAT — one sheet read, plus stored Tanay reference only (no external fetch).
  const heatData = getData_(getSheet_(APP.SHEETS.HEAT));
  let referenceStation = null;
  const heatIndex = heatData.rows
    .map(function(row){ return rowToObject_(row, heatData.index); })
    .filter(function(x){ return APP.BARANGAYS.indexOf(String(x.Barangay || '')) !== -1; })
    .map(function(x){
      if (x.Heat_Index_C !== '' && x.Heat_Index_C !== null) {
        x.Heat_Index_C = Number(x.Heat_Index_C);
        x.Risk_Level = heatRisk_(x.Heat_Index_C);
      }
      return x;
    });

  const refRaw = heatData.rows.find(function(raw){
    return String(raw[heatData.index.Barangay] || '') === 'CITY REFERENCE — TANAY AWS';
  });
  if (refRaw) {
    const x = rowToObject_(refRaw, heatData.index);
    const notes = String(x.Notes || '');
    const tm = notes.match(/Temp:\s*([0-9.]+)\s*C/i);
    const hm = notes.match(/RH:\s*([0-9.]+)\s*%/i);
    referenceStation = {
      station:'Tanay, Rizal AWS',
      value:Number(x.Heat_Index_C),
      risk:x.Risk_Level || heatRisk_(Number(x.Heat_Index_C)),
      temperature:tm ? Number(tm[1]) : NaN,
      humidity:hm ? Number(hm[1]) : NaN,
      observedAt:x.Observed_At || '',
      source:x.Source || APP.PAGASA.AWS_URL,
      sourceUrl:x.Source_URL || APP.PAGASA.AWS_URL,
      referenceOnly:true
    };
  } else {
    try {
      const cached = CacheService.getScriptCache().get('TANAY_HEAT_REFERENCE_V1');
      referenceStation = cached ? JSON.parse(cached) : null;
    } catch (e) {}
  }

  // ANNOUNCEMENTS — same normalized feed for public, admin and BHW.
  const announcementSnapshot = getAnnouncementFeedSnapshot_();
  let announcements = announcementSnapshot.visible.slice();
  if (role === 'bhw') {
    announcements = announcements.filter(function(a){
      return announcementBarangayMatches_(a.Barangay, liveUser.Barangay);
    });
  }
  const announcementDiagnostics = Object.assign({}, announcementSnapshot.diagnostics, {returnedToUser:announcements.length});

  // INVENTORY — one read, scoped server-side, no ensure/header checks.
  const inventoryData = getData_(getSheet_(APP.SHEETS.INVENTORY));
  let inventory = inventoryData.rows.map(function(row){ return rowToObject_(row, inventoryData.index); });
  if (role === 'bhw') inventory = inventory.filter(function(x){ return x.Barangay === scopeBarangay; });
  else if (scopeBarangay !== 'ALL') inventory = inventory.filter(function(x){ return x.Barangay === scopeBarangay; });

  const seenInventory = {};
  inventory = inventory.filter(function(x) {
    const isCentral = String(x.Barangay || '') === CENTRAL_STOCK_LOCATION;
    if (!isCentral) return true;
    const key = [
      String(x.Category || '').trim().toLowerCase(),
      String(x.Item_Name || '').trim().toLowerCase(),
      String(x.Unit || '').trim().toLowerCase(),
      Number(x.Current_Stock || 0),
      Number(x.Reorder_Level || 0),
      Number(x.Released || 0)
    ].join('|');
    if (seenInventory[key]) return false;
    seenInventory[key] = true;
    return true;
  });

  // CONNECTIVITY + PERSONNEL — derive both from the same Users read used for auth.
  const now = Date.now();
  let bhwUsers = usersData.rows
    .map(function(row){ return rowToObject_(row, usersData.index); })
    .filter(function(u){ return String(u.Role || '').toLowerCase() === 'bhw'; });

  let connectivity = bhwUsers.map(function(u){
    let status = 'Offline';
    if (u.Last_Seen) {
      const ageMin = (now - new Date(u.Last_Seen).getTime()) / 60000;
      if (ageMin <= APP.ONLINE_MINUTES) status = 'Online';
      else if (ageMin <= APP.PENDING_MINUTES) status = 'Pending';
    }
    return {
      User_ID:u.User_ID,
      Full_Name:u.Full_Name,
      Barangay:u.Barangay,
      Contact_Number:u.Contact_Number,
      Device_ID:u.Device_ID,
      Status:status,
      Last_Seen:u.Last_Seen || ''
    };
  });
  if (role === 'bhw') connectivity = connectivity.filter(function(x){ return x.Barangay === liveUser.Barangay; });

  let personnel = usersData.rows
    .map(function(row){ return rowToObject_(row, usersData.index); })
    .filter(function(u){ return String(u.Status || '').toLowerCase() === 'active'; })
    .map(safeUser_);

  // Admin User Management used to make a second /users web request after dashboard.
  // Return all accounts here so the frontend can populate that module with no extra trip.
  const allUsers = role === 'admin'
    ? usersData.rows.map(function(row){ return safeUser_(rowToObject_(row, usersData.index)); })
    : null;

  const response = {
    ok:true,
    scope:scopeBarangay,
    patients:patients,
    heatIndex:heatIndex,
    announcements:announcements,
    announcementDiagnostics:announcementDiagnostics,
    backendVersion:APP.VERSION,
    inventory:inventory,
    connectivity:connectivity,
    personnel:personnel,
    referenceStation:referenceStation
  };
  if (allUsers) response.users = allUsers;
  return response;
}

function getPublicDashboard_() {
  const publicAnnouncementFeed = getPublicAnnouncements_();
  const patientData = getData_(getSheet_(APP.SHEETS.PATIENTS));
  const patients = patientData.rows.map(function(row){
    const x = rowToObject_(row, patientData.index);

    // Do not expose unnecessary patient identifiers publicly.
    return {
      Report_ID:x.Report_ID,
      Date_Time:x.Date_Time,
      Age:x.Age,
      Sex:x.Sex,
      Age_Group:x.Age_Group,
      Barangay:x.Barangay,
      Condition:x.Condition,
      Critical:Boolean(x.Critical),
      Status:x.Status
    };
  });

  return {
    ok:true,
    patients:patients,
    announcements:publicAnnouncementFeed.announcements,
    announcementDiagnostics:publicAnnouncementFeed.diagnostics,
    backendVersion:APP.VERSION,
    heatIndex:getHeatIndex_({}).heatIndex
  };
}


/* ======================================================
   BARANGAY ASSIGNMENTS
   ====================================================== */

function syncBarangayAssignment_() {
  const sh = getSheet_(APP.SHEETS.BARANGAYS);
  const data = getData_(sh);

  const usersSheet = getData_(getSheet_(APP.SHEETS.USERS));
  const bhws = usersSheet.rows
    .map(function(row){ return rowToObject_(row, usersSheet.index); })
    .filter(function(u){ return u.Role === 'bhw' && u.Status === 'Active'; });

  const byBarangay = {};
  bhws.forEach(function(u){
    byBarangay[u.Barangay] = u;
  });

  APP.BARANGAYS.forEach(function(barangay, index){
    const found = data.rows.findIndex(function(row){
      return String(row[data.index.Barangay]) === barangay;
    });

    if (found < 0) return;

    const u = byBarangay[barangay];

    sh.getRange(found + 2, data.index.Active + 1).setValue(true);
    sh.getRange(found + 2, data.index.BHW_User_ID + 1).setValue(u ? u.User_ID : '');
    sh.getRange(found + 2, data.index.BHW_Name + 1).setValue(u ? u.Full_Name : '');
    sh.getRange(found + 2, data.index.BHW_Contact + 1).setValue(u ? u.Contact_Number : '');
    sh.getRange(found + 2, data.index.Updated_At + 1).setValue(now_());
  });
}


/* ======================================================
   HELPERS / VALIDATION
   ====================================================== */

function requireRole_(r, roles) {
  const liveUser = resolveSessionUser_(r);
  const liveRole = String(liveUser.Role || '').toLowerCase();
  if (roles.map(function(x){ return String(x).toLowerCase(); }).indexOf(liveRole) === -1) {
    throw new Error('Unauthorized action.');
  }
  r.user = liveUser;
  return liveUser;
}

/** Server-issued session token lookup. Passwords and raw tokens are never stored in AuthSessions. */
function resolveSessionUser_(r) {
  const token = String(r && (r.sessionToken || r.session_token) || '').trim();
  if (!token || token.length < 32 || token.length > 256) throw new Error('Secure session required. Sign in online and try again.');
  const tokenHash = hashPassword_(token);
  const sessionSheet = getSheet_(APP.SHEETS.AUTH_SESSIONS);
  const sessionData = getData_(sessionSheet);
  let sessionRow = -1;
  let sessionObj = null;
  for (let i = 0; i < sessionData.rows.length; i++) {
    const obj = rowToObject_(sessionData.rows[i], sessionData.index);
    if (String(obj.Token_Hash || '') === tokenHash) {
      sessionRow = i;
      sessionObj = obj;
      break;
    }
  }
  if (!sessionObj || isTruthy_(sessionObj.Revoked)) throw new Error('Secure session is invalid or has been revoked. Sign in again.');
  const expiry = new Date(sessionObj.Expires_At || '').getTime();
  if (!isFinite(expiry) || expiry <= Date.now()) throw new Error('Secure session expired. Sign in online again.');

  const usersSheet = getSheet_(APP.SHEETS.USERS);
  const usersData = getData_(usersSheet);
  const found = findRowById_(usersData, String(sessionObj.User_ID || ''), 'User_ID');
  const liveUser = found ? rowToObject_(usersData.rows[found.row], usersData.index) : null;
  if (!liveUser || String(liveUser.Status || '').toLowerCase() !== 'active') throw new Error('Account is not active.');
  if (r && r.user && r.user.User_ID && String(r.user.User_ID) !== String(liveUser.User_ID)) throw new Error('Session account mismatch. Sign in again.');

  // Throttle last-used writes to avoid extra sheet writes on every API request.
  const lastUsed = new Date(sessionObj.Last_Used_At || '').getTime();
  if (!isFinite(lastUsed) || Date.now() - lastUsed > 5 * 60 * 1000) {
    try {
      sessionSheet.getRange(sessionRow + 2, sessionData.index.Last_Used_At + 1).setValue(now_());
    } catch (e) {}
  }
  REQUEST_AUTH_[String(liveUser.User_ID)] = {user:liveUser, usersData:usersData};
  r.__authUsersData = usersData;
  return liveUser;
}

function createAuthSession_(user, deviceId) {
  const ss = getDatabaseSpreadsheet_();
  const sheet = ensureSheet_(ss, APP.SHEETS.AUTH_SESSIONS, HEADERS.AuthSessions);
  ensureHeaderColumnsAppend_(sheet, HEADERS.AuthSessions);
  const data = getData_(sheet);
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const item = {
    Session_ID:uuid_(), User_ID:String(user.User_ID || ''), Token_Hash:hashPassword_(token),
    Created_At:now.toISOString(), Expires_At:expires.toISOString(), Last_Used_At:now.toISOString(),
    Revoked:false, Device_ID:String(deviceId || '')
  };
  sheet.appendRow(objectToRow_(item, data.index));
  return token;
}

function logout_(r) {
  const token = String(r && (r.sessionToken || r.session_token) || '').trim();
  if (token) {
    try {
      const hash = hashPassword_(token);
      const sh = getSheet_(APP.SHEETS.AUTH_SESSIONS);
      const data = getData_(sh);
      for (let i = 0; i < data.rows.length; i++) {
        if (String(data.rows[i][data.index.Token_Hash] || '') === hash) {
          sh.getRange(i + 2, data.index.Revoked + 1).setValue(true);
          break;
        }
      }
    } catch (e) {}
  }
  return {ok:true};
}

function revokeOtherAuthSessions_(userId, keepToken) {
  const sh = getSheet_(APP.SHEETS.AUTH_SESSIONS);
  const data = getData_(sh);
  const keepHash = keepToken ? hashPassword_(String(keepToken)) : '';
  let changed = 0;
  data.rows.forEach(function(row, i) {
    if (String(row[data.index.User_ID] || '') !== String(userId || '')) return;
    if (keepHash && String(row[data.index.Token_Hash] || '') === keepHash) return;
    if (isTruthy_(row[data.index.Revoked])) return;
    sh.getRange(i + 2, data.index.Revoked + 1).setValue(true);
    changed++;
  });
  return changed;
}

function isTruthy_(value) {
  return value === true || value === 1 || ['true','yes','1','revoked','inactive'].indexOf(String(value || '').trim().toLowerCase()) !== -1;
}
function getUserById_(id) {
  const uid = String(id || '').trim();
  if (!uid) return null;

  if (REQUEST_AUTH_[uid] && REQUEST_AUTH_[uid].user) {
    return REQUEST_AUTH_[uid].user;
  }

  const key = liveUserCacheKey_(uid);
  try {
    const cached = CacheService.getScriptCache().get(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed) return parsed;
    }
  } catch (e) {}

  const data = getData_(getSheet_(APP.SHEETS.USERS));
  const found = findRowById_(data, uid, 'User_ID');
  const user = found ? rowToObject_(data.rows[found.row], data.index) : null;
  if (user) putLiveUserCache_(user);
  return user;
}

function updateUserLastSeen_(userId, deviceId) {
  const sh = getSheet_(APP.SHEETS.USERS);
  const data = getData_(sh);
  const found = findRowById_(data, String(userId), 'User_ID');

  if (!found) return;

  sh.getRange(found.row + 2, data.index.Last_Seen + 1).setValue(now_());
  sh.getRange(found.row + 2, data.index.Device_ID + 1).setValue(deviceId || '');
  sh.getRange(found.row + 2, data.index.Updated_At + 1).setValue(now_());
}

function rowToObject_(row, index) {
  const out = {};

  Object.keys(index).forEach(function(key){
    out[key] = row[index[key]] ?? '';
  });

  return out;
}

function objectToRow_(obj, index) {
  // Header indexes may not be contiguous if a legacy sheet has blank/duplicate labels.
  // Size by the greatest actual column index to prevent values shifting/truncating.
  const indexes = Object.keys(index).map(function(key) { return Number(index[key]); }).filter(Number.isFinite);
  const width = indexes.length ? Math.max.apply(null, indexes) + 1 : 0;
  const row = new Array(width).fill('');
  Object.keys(index).forEach(function(key){
    row[index[key]] = obj && obj[key] !== undefined && obj[key] !== null ? obj[key] : '';
  });
  return row;
}

function getData_(sheet) {
  if (!sheet) throw new Error('Sheet not found.');

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow < 1 || lastCol < 1) {
    return {rows:[],index:{}};
  }

  const values = sheet.getRange(1,1,lastRow,lastCol).getValues();
  const headers = values.shift().map(function(h) { return String(h || '').trim(); });

  const index = {};
  headers.forEach(function(h,i){
    index[h] = i;
  });

  return {
    rows:values,
    index:index
  };
}

function findRowById_(data, id, key) {
  const idx = data.index[key];

  if (idx === undefined) return null;

  for (let i=0; i<data.rows.length; i++) {
    if (String(data.rows[i][idx] || '') === String(id)) {
      return {row:i};
    }
  }

  return null;
}

function getSheet_(name) {
  const key = String(name || '');
  if (REQUEST_SHEETS_[key]) return REQUEST_SHEETS_[key];
  const sh = getDatabaseSpreadsheet_().getSheetByName(key);
  if (sh) REQUEST_SHEETS_[key] = sh;
  return sh;
}

function clearDataRows_(sheet) {
  if (!sheet) return;

  const rows = sheet.getLastRow();

  if (rows > 1) {
    sheet.getRange(2,1,rows-1,sheet.getLastColumn()).clearContent();
  }
}

function ageGroup_(age) {
  age = Number(age);

  if (!isFinite(age)) return 'Unknown';
  if (age <= 17) return 'Pedia / Bata';
  if (age <= 59) return 'Adult';
  return 'Matanda / Senior';
}

function safeUser_(u) {
  if (!u) return null;
  return {
    User_ID:u.User_ID,
    Full_Name:u.Full_Name,
    Role:u.Role,
    Username:u.Username,
    Barangay:u.Barangay,
    Contact_Number:u.Contact_Number,
    Status:u.Status,
    Last_Seen:u.Last_Seen,
    Device_ID:u.Device_ID,
    Hospital_ID:u.Hospital_ID || '',
    Must_Change_Password:u.Must_Change_Password === true || String(u.Must_Change_Password).toLowerCase() === 'true'
  };
}

function getOrCreatePhotoFolder_() {
  const settings = getSettingMap_();
  const folderName = settings.PROFILE_PHOTO_FOLDER ||
    'Super El Niño — Personnel Photos';

  const folders = DriveApp.getFoldersByName(folderName);

  if (folders.hasNext()) return folders.next();

  return DriveApp.createFolder(folderName);
}

function getSettingMap_() {
  const data = getData_(getSheet_(APP.SHEETS.SETTINGS));
  const out = {};

  data.rows.forEach(function(row){
    out[String(row[data.index.Setting] || '')] =
      String(row[data.index.Value] || '');
  });

  return out;
}

function logAudit_(userId, username, role, action, entity, entityId, details) {
  try {
    const sh = getSheet_(APP.SHEETS.AUDIT);

    sh.appendRow([
      uuid_(),
      now_(),
      userId || '',
      username || '',
      role || '',
      action || '',
      entity || '',
      entityId || '',
      details || ''
    ]);
  } catch (err) {
    // Do not block main transaction because an audit insert failed.
  }
}

function cleanupOldSyncQueue_() {
  const sh = getSheet_(APP.SHEETS.SYNC);
  if (!sh) return;

  const data = getData_(sh);
  if (!data.rows.length) return;

  const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);

  for (let i=data.rows.length-1; i>=0; i--) {
    const status = String(data.rows[i][data.index.Status] || '');
    const created = new Date(data.rows[i][data.index.Created_At] || '').getTime();

    if (status === 'done' && isFinite(created) && created < cutoff) {
      sh.deleteRow(i + 2);
    }
  }
}

function hashPassword_(password) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(password),
    Utilities.Charset.UTF_8
  );

  return digest.map(function(byte){
    const v = byte < 0 ? byte + 256 : byte;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function uuid_() {
  return Utilities.getUuid();
}

function now_() {
  return Utilities.formatDate(
    new Date(),
    APP.TIMEZONE,
    "yyyy-MM-dd'T'HH:mm:ssXXX"
  );
}

function parseRequestBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};

  const contentType = String(e.postData.type || '');

  if (contentType.indexOf('application/json') !== -1) {
    return JSON.parse(e.postData.contents);
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    return e.parameter || {};
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeError_(err) {
  return err && err.message ? err.message : String(err);
}

function parseNumber_(value) {
  const m = String(value || '').replace(/,/g,'').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

function stripHtml_(value) {
  return String(value || '')
    .replace(/<[^>]*>/g,' ')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/\s+/g,' ')
    .trim();
}

function escapeRegExp_(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
}

function sanitizeFileName_(value) {
  return String(value || 'photo')
    .replace(/[<>:"/\\|?*]+/g,'_')
    .replace(/\s+/g,'_')
    .slice(0,80);
}

function toast_(message) {
  try {
    SpreadsheetApp.getActive().toast(message, APP.NAME, 5);
  } catch (err) {}
}
