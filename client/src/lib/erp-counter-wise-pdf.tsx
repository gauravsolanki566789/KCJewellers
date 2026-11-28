import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { presentPdfBlob } from '@/lib/pdf-share'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'

export type CounterWisePdfRow = {
  counter: string
  opening: number
  receipt: number
  issue: number
  closing: number
}

export type CounterWisePdfReport = {
  from: string
  to: string
  shopName?: string
  rows: CounterWisePdfRow[]
  total: { opening: number; receipt: number; issue: number; closing: number }
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: 'Helvetica', color: '#1a1814' },
  shopName: { fontSize: 14, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' },
  title: { fontSize: 12, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' },
  sub: { fontSize: 9, color: '#444', marginBottom: 14, textAlign: 'center' },
  header: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#999',
    paddingBottom: 5,
    marginBottom: 4,
    fontWeight: 'bold',
    fontSize: 9,
  },
  row: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  total: { flexDirection: 'row', paddingVertical: 6, marginTop: 4, fontWeight: 'bold' },
  cName: { width: '24%' },
  cNum: { width: '19%', textAlign: 'right' },
})

function gm(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const t = Math.round(n * 1e6) / 1e6
  return String(t)
}

function CounterWiseDocument({ report }: { report: CounterWisePdfReport }) {
  const period =
    report.from === report.to
      ? formatErpDateDdMmYyyy(report.from)
      : `${formatErpDateDdMmYyyy(report.from)} – ${formatErpDateDdMmYyyy(report.to)}`
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {report.shopName ? <Text style={styles.shopName}>{report.shopName}</Text> : null}
        <Text style={styles.title}>Counter wise report</Text>
        <Text style={styles.sub}>Weights in grams · {period}</Text>
        <View style={styles.header}>
          <Text style={styles.cName}>Counter</Text>
          <Text style={styles.cNum}>Opening</Text>
          <Text style={styles.cNum}>Receipt</Text>
          <Text style={styles.cNum}>Issue</Text>
          <Text style={styles.cNum}>Closing</Text>
        </View>
        {report.rows.map((r) => (
          <View key={r.counter} style={styles.row}>
            <Text style={styles.cName}>{r.counter}</Text>
            <Text style={styles.cNum}>{gm(r.opening)}</Text>
            <Text style={styles.cNum}>{gm(r.receipt)}</Text>
            <Text style={styles.cNum}>{gm(r.issue)}</Text>
            <Text style={styles.cNum}>{gm(r.closing)}</Text>
          </View>
        ))}
        <View style={styles.total}>
          <Text style={styles.cName}>Total</Text>
          <Text style={styles.cNum}>{gm(report.total.opening)}</Text>
          <Text style={styles.cNum}>{gm(report.total.receipt)}</Text>
          <Text style={styles.cNum}>{gm(report.total.issue)}</Text>
          <Text style={styles.cNum}>{gm(report.total.closing)}</Text>
        </View>
      </Page>
    </Document>
  )
}

export async function previewCounterWisePdf(report: CounterWisePdfReport) {
  const blob = await pdf(<CounterWiseDocument report={report} />).toBlob()
  await presentPdfBlob(blob, `counter-wise-${report.from}-${report.to}.pdf`)
}
