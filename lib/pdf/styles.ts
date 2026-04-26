import { StyleSheet } from '@react-pdf/renderer'

// カラー定数（ConfirmationClient.tsx と同一）
export const MAIN = '#1C2948'
export const SUB = '#71A9F7'
export const SUCCESS = '#2FBF71'

export const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: 'LineSeedJP',
    fontSize: 10,
  },
  header: {
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 16,
    color: MAIN,
    marginBottom: 12,
  },
  sectionTitle: {
    fontWeight: 'bold',
    fontSize: 12,
    color: MAIN,
    marginTop: 14,
  },
  sectionBox: {
    backgroundColor: '#ffffff',
    padding: 10,
    marginTop: 6,
  },
  label: {
    fontSize: 8,
    color: '#666666',
  },
  value: {
    fontSize: 10,
    color: '#333333',
  },
  signatureImage: {
    width: 180,
    height: 80,
  },
  dateText: {
    textAlign: 'right',
    fontSize: 10,
  },
  checkItem: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 3,
  },
  batteryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  footer: {
    marginTop: 20,
  },
})
