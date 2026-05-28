import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import AdminLayout from '../../components/AdminLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Loader2, Upload, FileSpreadsheet } from 'lucide-react'

// Column layout (0-indexed):
// A(0) Código interno  B(1) EAN  C(2) Nombre  D(3) Descripción  E(4) Categoría  F(5) Subcategoría
// G(6) Precio u. min.  H(7) Precio u. med.  I(8) Precio u. may.  J(9) Unidad base
// K(10) Precio pack min.  L(11) med.  M(12) may.  N(13) Uds/pack
// O(14) Precio pallet min.  P(15) med.  Q(16) may.  R(17) Uds/pallet
// S(18) Variantes (sep. |)  T(19) Activo (SI/NO)

const COLUMNS = [
  'A: Código interno','B: EAN','C: Nombre','D: Descripción','E: Categoría','F: Subcategoría',
  'G: Precio u. min.','H: Precio u. med.','I: Precio u. may.','J: Unidad base',
  'K: Precio pack min.','L: Precio pack med.','M: Precio pack may.','N: Uds/pack',
  'O: Precio pallet min.','P: Precio pallet med.','Q: Precio pallet may.','R: Uds/pallet',
  'S: Variantes (sep. |)','T: Activo (SI/NO)',
]
const EXAMPLE = [
  'PROD-001','7790040012345','Aceite Girasol','900ml','Almacén','',
  '1050','980','900','unidad','950','880','810','25','800','740','680','180',
  'Girasol | Maíz','SI',
]

function parsePrice(val) {
  const n = parseFloat(String(val ?? '').replace(',', '.'))
  return isNaN(n) || n <= 0 ? null : n
}

async function fetchOFFImageUrl(ean) {
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 8000)
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${ean}.json`,
      { signal: controller.signal }
    )
    const data = await res.json()
    if (data.status === 1) {
      return data.product?.image_front_url || data.product?.image_url || null
    }
  } catch {}
  return null
}

export default function AdminImport() {
  const fileRef = useRef()
  const [rows, setRows]           = useState([])
  const [preview, setPreview]     = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult]       = useState(null)
  const [error, setError]         = useState('')
  const [searchImages, setSearchImages] = useState(false)
  const [importProgress, setImportProgress] = useState('')

  const cap = (str, max) => String(str ?? '').trim().slice(0, max)

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setError(''); setResult(null)

    if (file.size > 15 * 1024 * 1024) { setError('El archivo es demasiado grande. Máximo 15 MB.'); if (fileRef.current) fileRef.current.value = ''; return }
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['xlsx', 'xls'].includes(ext)) { setError('Solo se aceptan archivos .xlsx o .xls.'); if (fileRef.current) fileRef.current.value = ''; return }

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb   = XLSX.read(ev.target.result, { type: 'array' })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        if (data.length > 10001) { setError('El archivo tiene demasiadas filas. Máximo 10.000 productos por importación.'); return }
        const parseInt0 = v => { const n = parseInt(v); return isNaN(n) || n <= 0 ? null : n }
        const parsed = data.slice(1).filter(r => r.some(c => c !== '')).map((r, idx) => ({
          _row: idx + 2,
          codigo_interno: cap(r[0], 50), ean: cap(r[1], 30), nombre: cap(r[2], 200),
          descripcion: cap(r[3], 500), categoria: cap(r[4], 100),
          precio: parsePrice(r[6]), precio_mediano: parsePrice(r[7]), precio_mayorista: parsePrice(r[8]),
          unidad: cap(r[9] || 'unidad', 30).toLowerCase(),
          precio_pack: parsePrice(r[10]), precio_pack_mediano: parsePrice(r[11]), precio_pack_mayorista: parsePrice(r[12]),
          unidades_pack: parseInt0(r[13]),
          precio_pallet: parsePrice(r[14]), precio_pallet_mediano: parsePrice(r[15]), precio_pallet_mayorista: parsePrice(r[16]),
          unidades_pallet: parseInt0(r[17]),
          variantes: cap(r[18], 300),
          activo: String(r[19] ?? 'SI').trim().toUpperCase() !== 'NO',
        }))
        setRows(parsed); setPreview(true)
      } catch { setError('No se pudo leer el archivo. Verificá que sea un .xlsx válido.') }
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleImport() {
    setImporting(true); setError(''); setImportProgress('')
    let created = 0, updated = 0, imgFound = 0, errors = []
    const catCache = {}
    const { data: existingCats } = await supabase.from('categorias').select('id, nombre')
    existingCats?.forEach(c => { catCache[c.nombre.toLowerCase()] = c.id })

    for (const [i, row] of rows.entries()) {
      setImportProgress(`Procesando ${i + 1} / ${rows.length}…`)
      if (!row.nombre || !row.codigo_interno) { errors.push(`Fila ${row._row}: nombre y código interno son obligatorios.`); continue }
      if (!row.precio) { errors.push(`Fila ${row._row}: precio minorista inválido o vacío.`); continue }
      try {
        let catId = null
        if (row.categoria) {
          const catKey = row.categoria.toLowerCase()
          if (!catCache[catKey]) {
            const { data: newCat } = await supabase.from('categorias').insert({ nombre: row.categoria }).select().single()
            catCache[catKey] = newCat.id
          }
          catId = catCache[catKey]
        }

        // Buscar imagen en Open Food Facts si el checkbox está activo y hay EAN
        let imagen_url = null
        if (searchImages && row.ean && row.ean.length >= 8) {
          setImportProgress(`Buscando imagen ${i + 1} / ${rows.length} (${row.nombre})…`)
          imagen_url = await fetchOFFImageUrl(row.ean)
          if (imagen_url) imgFound++
        }

        const { data: existing } = await supabase.from('productos').select('id, imagen_url').eq('codigo_interno', row.codigo_interno).single()
        const productData = {
          codigo_interno: row.codigo_interno, ean: row.ean || null, nombre: row.nombre,
          descripcion: row.descripcion || null, categoria_id: catId,
          precio: row.precio, precio_mediano: row.precio_mediano, precio_mayorista: row.precio_mayorista,
          precio_pack: row.precio_pack, precio_pack_mediano: row.precio_pack_mediano, precio_pack_mayorista: row.precio_pack_mayorista,
          unidades_pack: row.unidades_pack,
          precio_pallet: row.precio_pallet, precio_pallet_mediano: row.precio_pallet_mediano, precio_pallet_mayorista: row.precio_pallet_mayorista,
          unidades_pallet: row.unidades_pallet,
          unidad: row.unidad || 'unidad', activo: row.activo,
          // Si la búsqueda encontró imagen: usar esa. Si no y el producto ya tenía una: mantenerla.
          imagen_url: imagen_url ?? (existing?.imagen_url ?? null),
        }
        let productId
        if (existing) { await supabase.from('productos').update(productData).eq('id', existing.id); productId = existing.id; updated++ }
        else { const { data: newProd } = await supabase.from('productos').insert(productData).select().single(); productId = newProd.id; created++ }

        if (row.variantes) {
          const variantValues = row.variantes.split('|').map(v => v.trim()).filter(Boolean)
          if (variantValues.length > 0) {
            await supabase.from('variantes_producto').delete().eq('producto_id', productId)
            await supabase.from('variantes_producto').insert(variantValues.map(v => ({ producto_id: productId, valor: v })))
          }
        }
      } catch (err) { errors.push(`Fila ${row._row}: ${err.message}`) }
    }

    setResult({ created, updated, imgFound: searchImages ? imgFound : null, errors })
    setImporting(false); setPreview(false); setRows([]); setImportProgress('')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-negro">Importar catálogo</h2>
        <p className="text-muted-foreground text-sm mt-1">Cargá o actualizá productos desde un archivo Excel (.xlsx).</p>
      </div>

      {/* Format reference */}
      <Card className="mb-5 shadow-panel">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Formato esperado del Excel</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="w-full whitespace-nowrap rounded-md border">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="bg-negro hover:bg-negro">
                  {COLUMNS.map(h => <TableHead key={h} className="text-white text-[0.68rem] whitespace-nowrap">{h}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  {EXAMPLE.map((v, i) => <TableCell key={i} className="whitespace-nowrap py-2 text-[0.75rem]">{v}</TableCell>)}
                </TableRow>
              </TableBody>
            </Table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          <p className="text-[0.72rem] text-muted-foreground mt-3">
            Dejá las celdas de Pack/Pallet vacías si el producto no se vende en esa presentación.
            Las columnas de precios mediano y mayorista también son opcionales.
          </p>
        </CardContent>
      </Card>

      {/* Upload */}
      <Card className="shadow-panel">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-1.5 mb-5">
            <label className="text-[0.72rem] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileSpreadsheet size={14} /> Seleccionar archivo Excel
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFile}
              className="h-10 rounded-md border border-input bg-white px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-semibold file:text-negro hover:file:text-amarillo cursor-pointer"
            />
          </div>

          {error && (
            <Alert variant="destructive" className="mb-5">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result && (
            <Alert className="mb-5 bg-amarillo-cl border-amarillo/30 text-[#7A4B00]">
              <AlertDescription>
                <strong>Importación completada:</strong> {result.created} productos nuevos, {result.updated} actualizados.
                {result.imgFound != null && (
                  <span className="ml-1">· <strong>{result.imgFound} imágenes</strong> encontradas en Open Food Facts.</span>
                )}
                {result.errors.length > 0 && (
                  <div className="mt-2">
                    <strong>Errores ({result.errors.length}):</strong>
                    <ul className="list-disc pl-5 mt-1 space-y-0.5">
                      {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {preview && rows.length > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <span className="font-semibold text-sm">{rows.length} filas detectadas. Revisá la preview:</span>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
                    <input
                      type="checkbox"
                      checked={searchImages}
                      onChange={e => setSearchImages(e.target.checked)}
                      disabled={importing}
                      className="w-4 h-4 rounded accent-amarillo"
                    />
                    <span>
                      Buscar imágenes en Open Food Facts
                      <span className="text-muted-foreground text-xs ml-1">(requiere EAN · ~5 seg/producto)</span>
                    </span>
                  </label>
                  <Button onClick={handleImport} disabled={importing} className="bg-negro text-white hover:bg-negro/90 gap-2">
                    {importing
                      ? <><Loader2 size={14} className="animate-spin" /> {importProgress || 'Importando...'}</>
                      : <><Upload size={14} /> Importar {rows.length} productos</>}
                  </Button>
                </div>
              </div>
              <ScrollArea className="w-full h-72 whitespace-nowrap rounded-md border">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="bg-negro hover:bg-negro">
                      {['Fila','Código','Nombre','Precio u. min.','Pack (precio/u · cant.)','Pallet (precio/u · cant.)','Categoría','Variantes','Activo'].map(h => (
                        <TableHead key={h} className="text-white text-[0.68rem] whitespace-nowrap">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(r => (
                      <TableRow key={r._row} className={!r.nombre || !r.codigo_interno ? 'bg-yellow-50' : 'hover:bg-cream'}>
                        <TableCell>{r._row}</TableCell>
                        <TableCell>{r.codigo_interno || <span className="text-danger font-bold">FALTA</span>}</TableCell>
                        <TableCell className="max-w-[160px] truncate">{r.nombre || <span className="text-danger font-bold">FALTA</span>}</TableCell>
                        <TableCell>{r.precio ? `$${r.precio}` : <span className="text-danger font-bold">FALTA</span>}</TableCell>
                        <TableCell>
                          {r.precio_pack ? <span>${r.precio_pack}{r.unidades_pack ? <> · <strong>×{r.unidades_pack} u.</strong></> : ''}</span> : '—'}
                        </TableCell>
                        <TableCell>
                          {r.precio_pallet ? <span>${r.precio_pallet}{r.unidades_pallet ? <> · <strong>×{r.unidades_pallet} u.</strong></> : ''}</span> : '—'}
                        </TableCell>
                        <TableCell>{r.categoria}</TableCell>
                        <TableCell className="max-w-[120px] truncate">{r.variantes || '—'}</TableCell>
                        <TableCell>{r.activo ? 'SI' : 'NO'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  )
}
