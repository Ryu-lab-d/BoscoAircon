import DocumentPicker, { isCancel, types } from 'react-native-document-picker';
import RNFS from 'react-native-fs';

export interface PickedWorkbook {
  /** Display name of the file the user picked, e.g. "Timetable.xlsx". */
  name: string;
  /** Local path of the copy react-native-document-picker made in app storage. */
  path: string;
  /** File contents as base64, ready for parseTimetableWorkbookFromBase64(). */
  base64: string;
}

/**
 * Lets the user pick an .xlsx file from device storage (Files app, Drive,
 * email attachment, etc.), copies it into app-private storage so it stays
 * readable on future launches without re-requesting permission, and reads
 * it back as base64.
 *
 * Returns `null` if the user cancels the picker — that's not an error.
 */
export async function pickWorkbook(): Promise<PickedWorkbook | null> {
  let picked;
  try {
    picked = await DocumentPicker.pickSingle({
      type: [types.xlsx, types.xls],
      copyTo: 'documentDirectory',
    });
  } catch (err) {
    if (isCancel(err)) {
      return null;
    }
    throw err;
  }

  const path = picked.fileCopyUri ?? picked.uri;
  const base64 = await RNFS.readFile(path, 'base64');

  return {
    name: picked.name ?? 'timetable.xlsx',
    path,
    base64,
  };
}
