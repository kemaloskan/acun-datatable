import type { ImportMode, ImportStatus } from './protocol';

/** Every text of the import dialog. Numbers and sizes arrive formatted. */
export interface ImportLabels {
  readonly title: string;
  readonly menuItem: string;
  readonly close: string;
  readonly drop: string;
  readonly choose: string;
  readonly accepted: (types: string) => string;
  readonly maxSize: (size: string) => string;
  readonly maxRows: (rows: string) => string;
  readonly template: string;
  readonly tooLarge: (size: string) => string;
  readonly wrongType: string;
  readonly uploadAnyway: string;
  readonly uploading: (name: string) => string;
  readonly mappingTitle: string;
  readonly mappingHint: string;
  readonly fileColumn: string;
  readonly tableColumn: string;
  readonly skip: string;
  readonly emptyHeader: (position: number) => string;
  readonly required: string;
  readonly missingRequired: (names: string) => string;
  readonly mappedTwice: (name: string) => string;
  readonly mode: string;
  readonly modes: Readonly<Record<ImportMode, string>>;
  readonly preview: string;
  readonly sample: string;
  readonly fileRows: (rows: string) => string;
  readonly back: string;
  readonly start: string;
  readonly queued: string;
  readonly working: string;
  readonly progress: (done: string, total: string) => string;
  readonly progressOpen: (done: string) => string;
  readonly cancel: string;
  readonly results: Readonly<Record<Extract<ImportStatus, 'done' | 'failed' | 'cancelled' | 'expired'>, string>>;
  readonly inserted: string;
  readonly updated: string;
  readonly skipped: string;
  readonly failed: string;
  readonly problems: string;
  readonly line: (line: string) => string;
  readonly moreProblems: string;
  readonly report: string;
  readonly retry: string;
  readonly another: string;
  readonly requestFailed: string;
}

export const importLabelsEn: ImportLabels = {
  title: 'Import',
  menuItem: 'Import…',
  close: 'Close',
  drop: 'Drop an Excel or CSV file here',
  choose: 'Choose a file',
  accepted: types => `Accepted: ${types}`,
  maxSize: size => `Up to ${size}`,
  maxRows: rows => `up to ${rows} rows`,
  template: 'Download the template',
  tooLarge: size => `This file is larger than ${size}; the server may refuse it.`,
  wrongType: 'The server may not take this type of file.',
  uploadAnyway: 'Upload anyway',
  uploading: name => `Uploading ${name}…`,
  mappingTitle: 'Match the columns',
  mappingHint: 'Choose what each column of the file is imported as.',
  fileColumn: 'Column in the file',
  tableColumn: 'Imported as',
  skip: 'Do not import',
  emptyHeader: position => `Column ${position} (no header)`,
  required: 'required',
  missingRequired: names => `Match the required columns: ${names}.`,
  mappedTwice: name => `${name} is chosen for more than one column.`,
  mode: 'Rows that already exist',
  modes: { insert: 'Only add new rows', update: 'Only update existing rows', upsert: 'Add new rows, update existing ones' },
  preview: 'First rows of the file',
  sample: 'Example',
  fileRows: rows => `${rows} rows`,
  back: 'Choose another file',
  start: 'Import',
  queued: 'Waiting to start…',
  working: 'Importing…',
  progress: (done, total) => `${done} of ${total} rows`,
  progressOpen: done => `${done} rows`,
  cancel: 'Cancel import',
  results: { done: 'Import finished', failed: 'Import failed', cancelled: 'Import cancelled', expired: 'Import expired' },
  inserted: 'Added',
  updated: 'Updated',
  skipped: 'Skipped',
  failed: 'Refused',
  problems: 'Rows with problems',
  line: line => `Line ${line}`,
  moreProblems: 'More problems are listed in the report.',
  report: 'Download the error report (CSV)',
  retry: 'Try again',
  another: 'Import another file',
  requestFailed: 'The server could not be reached.',
};

export const importLabelsTr: ImportLabels = {
  title: 'İçe aktar',
  menuItem: 'İçe aktar…',
  close: 'Kapat',
  drop: 'Excel veya CSV dosyasını buraya bırakın',
  choose: 'Dosya seç',
  accepted: types => `Kabul edilenler: ${types}`,
  maxSize: size => `En çok ${size}`,
  maxRows: rows => `en çok ${rows} satır`,
  template: 'Şablonu indir',
  tooLarge: size => `Bu dosya ${size} boyutundan büyük; sunucu reddedebilir.`,
  wrongType: 'Sunucu bu dosya türünü kabul etmeyebilir.',
  uploadAnyway: 'Yine de yükle',
  uploading: name => `${name} yükleniyor…`,
  mappingTitle: 'Sütunları eşleştirin',
  mappingHint: 'Dosyadaki her sütunun neye aktarılacağını seçin.',
  fileColumn: 'Dosyadaki sütun',
  tableColumn: 'Aktarılacağı yer',
  skip: 'Aktarma',
  emptyHeader: position => `${position}. sütun (başlıksız)`,
  required: 'zorunlu',
  missingRequired: names => `Zorunlu sütunları eşleştirin: ${names}.`,
  mappedTwice: name => `${name} birden çok sütun için seçildi.`,
  mode: 'Var olan kayıtlar',
  modes: { insert: 'Yalnızca yeni kayıt ekle', update: 'Yalnızca var olanları güncelle', upsert: 'Yenileri ekle, var olanları güncelle' },
  preview: 'Dosyanın ilk satırları',
  sample: 'Örnek',
  fileRows: rows => `${rows} satır`,
  back: 'Başka dosya seç',
  start: 'İçe aktar',
  queued: 'Başlaması bekleniyor…',
  working: 'İçe aktarılıyor…',
  progress: (done, total) => `${done} / ${total} satır`,
  progressOpen: done => `${done} satır`,
  cancel: 'İçe aktarmayı durdur',
  results: { done: 'İçe aktarma tamamlandı', failed: 'İçe aktarma başarısız', cancelled: 'İçe aktarma durduruldu', expired: 'İçe aktarmanın süresi doldu' },
  inserted: 'Eklenen',
  updated: 'Güncellenen',
  skipped: 'Atlanan',
  failed: 'Reddedilen',
  problems: 'Sorunlu satırlar',
  line: line => `${line}. satır`,
  moreProblems: 'Diğer sorunlar raporda.',
  report: 'Hata raporunu indir (CSV)',
  retry: 'Tekrar dene',
  another: 'Başka dosya aktar',
  requestFailed: 'Sunucuya ulaşılamadı.',
};

export const importLabelsDe: ImportLabels = {
  title: 'Importieren',
  menuItem: 'Importieren…',
  close: 'Schließen',
  drop: 'Excel- oder CSV-Datei hier ablegen',
  choose: 'Datei auswählen',
  accepted: types => `Erlaubt: ${types}`,
  maxSize: size => `Bis ${size}`,
  maxRows: rows => `bis ${rows} Zeilen`,
  template: 'Vorlage herunterladen',
  tooLarge: size => `Diese Datei ist größer als ${size}; der Server lehnt sie möglicherweise ab.`,
  wrongType: 'Der Server nimmt diesen Dateityp möglicherweise nicht an.',
  uploadAnyway: 'Trotzdem hochladen',
  uploading: name => `${name} wird hochgeladen…`,
  mappingTitle: 'Spalten zuordnen',
  mappingHint: 'Wählen Sie für jede Spalte der Datei, wohin sie importiert wird.',
  fileColumn: 'Spalte in der Datei',
  tableColumn: 'Importiert als',
  skip: 'Nicht importieren',
  emptyHeader: position => `Spalte ${position} (ohne Überschrift)`,
  required: 'Pflicht',
  missingRequired: names => `Pflichtspalten zuordnen: ${names}.`,
  mappedTwice: name => `${name} ist für mehrere Spalten gewählt.`,
  mode: 'Vorhandene Datensätze',
  modes: { insert: 'Nur neue Zeilen hinzufügen', update: 'Nur vorhandene Zeilen aktualisieren', upsert: 'Neue hinzufügen, vorhandene aktualisieren' },
  preview: 'Erste Zeilen der Datei',
  sample: 'Beispiel',
  fileRows: rows => `${rows} Zeilen`,
  back: 'Andere Datei wählen',
  start: 'Importieren',
  queued: 'Wartet auf den Start…',
  working: 'Wird importiert…',
  progress: (done, total) => `${done} von ${total} Zeilen`,
  progressOpen: done => `${done} Zeilen`,
  cancel: 'Import abbrechen',
  results: { done: 'Import abgeschlossen', failed: 'Import fehlgeschlagen', cancelled: 'Import abgebrochen', expired: 'Import abgelaufen' },
  inserted: 'Hinzugefügt',
  updated: 'Aktualisiert',
  skipped: 'Übersprungen',
  failed: 'Abgelehnt',
  problems: 'Zeilen mit Problemen',
  line: line => `Zeile ${line}`,
  moreProblems: 'Weitere Probleme stehen im Bericht.',
  report: 'Fehlerbericht herunterladen (CSV)',
  retry: 'Erneut versuchen',
  another: 'Weitere Datei importieren',
  requestFailed: 'Der Server ist nicht erreichbar.',
};

export const importLabelsFr: ImportLabels = {
  title: 'Importer',
  menuItem: 'Importer…',
  close: 'Fermer',
  drop: 'Déposez un fichier Excel ou CSV ici',
  choose: 'Choisir un fichier',
  accepted: types => `Acceptés : ${types}`,
  maxSize: size => `Jusqu’à ${size}`,
  maxRows: rows => `jusqu’à ${rows} lignes`,
  template: 'Télécharger le modèle',
  tooLarge: size => `Ce fichier dépasse ${size} ; le serveur peut le refuser.`,
  wrongType: 'Le serveur peut refuser ce type de fichier.',
  uploadAnyway: 'Envoyer quand même',
  uploading: name => `Envoi de ${name}…`,
  mappingTitle: 'Associer les colonnes',
  mappingHint: 'Choisissez pour chaque colonne du fichier ce qu’elle devient.',
  fileColumn: 'Colonne du fichier',
  tableColumn: 'Importée comme',
  skip: 'Ne pas importer',
  emptyHeader: position => `Colonne ${position} (sans titre)`,
  required: 'obligatoire',
  missingRequired: names => `Associez les colonnes obligatoires : ${names}.`,
  mappedTwice: name => `${name} est choisi pour plusieurs colonnes.`,
  mode: 'Lignes déjà présentes',
  modes: { insert: 'Ajouter seulement les nouvelles lignes', update: 'Mettre à jour seulement les lignes existantes', upsert: 'Ajouter les nouvelles, mettre à jour les existantes' },
  preview: 'Premières lignes du fichier',
  sample: 'Exemple',
  fileRows: rows => `${rows} lignes`,
  back: 'Choisir un autre fichier',
  start: 'Importer',
  queued: 'En attente de démarrage…',
  working: 'Import en cours…',
  progress: (done, total) => `${done} sur ${total} lignes`,
  progressOpen: done => `${done} lignes`,
  cancel: 'Annuler l’import',
  results: { done: 'Import terminé', failed: 'Échec de l’import', cancelled: 'Import annulé', expired: 'Import expiré' },
  inserted: 'Ajoutées',
  updated: 'Mises à jour',
  skipped: 'Ignorées',
  failed: 'Refusées',
  problems: 'Lignes en erreur',
  line: line => `Ligne ${line}`,
  moreProblems: 'Les autres erreurs sont dans le rapport.',
  report: 'Télécharger le rapport d’erreurs (CSV)',
  retry: 'Réessayer',
  another: 'Importer un autre fichier',
  requestFailed: 'Le serveur est injoignable.',
};

export const importLabelsEs: ImportLabels = {
  title: 'Importar',
  menuItem: 'Importar…',
  close: 'Cerrar',
  drop: 'Suelte aquí un archivo Excel o CSV',
  choose: 'Elegir un archivo',
  accepted: types => `Se aceptan: ${types}`,
  maxSize: size => `Hasta ${size}`,
  maxRows: rows => `hasta ${rows} filas`,
  template: 'Descargar la plantilla',
  tooLarge: size => `Este archivo supera ${size}; el servidor puede rechazarlo.`,
  wrongType: 'Puede que el servidor no acepte este tipo de archivo.',
  uploadAnyway: 'Subir de todos modos',
  uploading: name => `Subiendo ${name}…`,
  mappingTitle: 'Relacionar las columnas',
  mappingHint: 'Elija como qué se importa cada columna del archivo.',
  fileColumn: 'Columna del archivo',
  tableColumn: 'Se importa como',
  skip: 'No importar',
  emptyHeader: position => `Columna ${position} (sin título)`,
  required: 'obligatoria',
  missingRequired: names => `Relacione las columnas obligatorias: ${names}.`,
  mappedTwice: name => `${name} está elegida para más de una columna.`,
  mode: 'Filas que ya existen',
  modes: { insert: 'Solo añadir filas nuevas', update: 'Solo actualizar las existentes', upsert: 'Añadir las nuevas, actualizar las existentes' },
  preview: 'Primeras filas del archivo',
  sample: 'Ejemplo',
  fileRows: rows => `${rows} filas`,
  back: 'Elegir otro archivo',
  start: 'Importar',
  queued: 'Esperando para empezar…',
  working: 'Importando…',
  progress: (done, total) => `${done} de ${total} filas`,
  progressOpen: done => `${done} filas`,
  cancel: 'Cancelar la importación',
  results: { done: 'Importación terminada', failed: 'La importación falló', cancelled: 'Importación cancelada', expired: 'La importación caducó' },
  inserted: 'Añadidas',
  updated: 'Actualizadas',
  skipped: 'Omitidas',
  failed: 'Rechazadas',
  problems: 'Filas con problemas',
  line: line => `Fila ${line}`,
  moreProblems: 'Los demás problemas están en el informe.',
  report: 'Descargar el informe de errores (CSV)',
  retry: 'Reintentar',
  another: 'Importar otro archivo',
  requestFailed: 'No se pudo conectar con el servidor.',
};

export const IMPORT_LABELS: Readonly<Record<string, ImportLabels>> = Object.freeze({
  en: importLabelsEn, tr: importLabelsTr, de: importLabelsDe, fr: importLabelsFr, es: importLabelsEs,
});

/** The texts for a language (`'tr'`, `'de-AT'` …; English when unknown), with your overrides. */
export function resolveImportLabels(language?: string, overrides: Partial<ImportLabels> = {}): ImportLabels {
  const base = IMPORT_LABELS[(language ?? 'en').toLowerCase().split('-')[0]!] ?? importLabelsEn;
  return { ...base, ...overrides };
}
