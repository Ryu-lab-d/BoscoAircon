import { pick, keepLocalCopy, isErrorWithCode, errorCodes, types } from '@react-native-documents/picker';
import RNFS from 'react-native-fs';

export interface PickedWorkbook {
  /** Display name of the file the user picked, e.g. "Timetable.xlsx". */
  name: string;
  /** Local path of the copy kept in app storage. */
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
    [picked] = await pick({
      type: [types.xlsx, types.xls],
    });
  } catch (err) {
    if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
      return null;
    }
    throw err;
  }

  const [copy] = await keepLocalCopy({
    files: [{ uri: picked.uri, fileName: picked.name ?? 'timetable.xlsx' }],
    destination: 'documentDirectory',
  });

  if (copy.status !== 'success') {
    throw new Error('Failed to copy picked file into app storage');
  }

  const base64 = await RNFS.readFile(copy.localUri, 'base64');

  return {
    name: picked.name ?? 'timetable.xlsx',
    path: copy.localUri,
    base64,
  };
}
