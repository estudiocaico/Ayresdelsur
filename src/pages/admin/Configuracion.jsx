import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import AdminLayout from '../../components/AdminLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Save, Check, Plus, X, ExternalLink } from 'lucide-react'

function formatPrice(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

const EMPTY_DESTINO = { numero: '', apikey: '' }

export default function AdminConfiguracion() {
  const [pedidoMinimo, setPedidoMinimo]       = useState('50000')
  const [destinos, setDestinos]               = useState([])
  const [newDest, setNewDest]                 = useState(EMPTY_DESTINO)
  const [apikeyGlobal, setApikeyGlobal]       = useState('')
  const [loading, setLoading]                 = useState(true)
  const [saving, setSaving]                   = useState(false)
  const [saved, setSaved]                     = useState(false)
  const [error, setError]                     = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('configuracion').select('clave, valor')
      if (data) {
        const map = Object.fromEntries(data.map(r => [r.clave, r.valor]))
        if (map.pedido_minimo) setPedidoMinimo(map.pedido_minimo)
        if (map.whatsapp_destinos) {
          try { setDestinos(JSON.parse(map.whatsapp_destinos)) } catch { setDestinos([]) }
        } else if (map.whatsapp_numeros) {
          try { setDestinos(JSON.parse(map.whatsapp_numeros).map(n => ({ numero: n, apikey: '' }))) } catch { setDestinos([]) }
        }
        if (map.callmebot_apikey_global) setApikeyGlobal(map.callmebot_apikey_global)
      }
      setLoading(false)
    }
    load()
  }, [])

  function addDestino() {
    const num = newDest.numero.replace(/\D/g, '')
    if (!num) return
    if (destinos.find(d => d.numero === num)) { setNewDest(EMPTY_DESTINO); return }
    setDestinos(prev => [...prev, { numero: num, apikey: newDest.apikey.trim() }])
    setNewDest(EMPTY_DESTINO)
  }
  function removeDestino(num) { setDestinos(prev => prev.filter(d => d.numero !== num)) }
  function updateApikey(num, val) { setDestinos(prev => prev.map(d => d.numero === num ? { ...d, apikey: val } : d)) }

  async function handleSave() {
    setSaving(true); setError('')
    try {
      await supabase.from('configuracion').upsert([
        { clave: 'pedido_minimo',          valor: String(Number(pedidoMinimo) || 0) },
        { clave: 'whatsapp_destinos',      valor: JSON.stringify(destinos) },
        { clave: 'callmebot_apikey_global', valor: apikeyGlobal.trim() },
      ])
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch { setError('Error al guardar. Verificá los permisos de admin.') }
    setSaving(false)
  }

  if (loading) return <AdminLayout><div className="flex items-center justify-center py-24"><Loader2 className="w-7 h-7 animate-spin text-amarillo" /></div></AdminLayout>

  return (
    <AdminLayout>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-negro">Configuración</h2>
        <p className="text-muted-foreground text-sm mt-1">Parámetros generales del sistema de preventa.</p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="max-w-[580px] space-y-5">

        {/* Pedido mínimo */}
        <Card className="shadow-panel">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pedido mínimo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[0.72rem] uppercase tracking-wider text-muted-foreground font-bold">
                Monto mínimo para confirmar un pedido ($)
              </Label>
              <Input type="number" min="0" step="1000" value={pedidoMinimo}
                onChange={e => setPedidoMinimo(e.target.value)} className="max-w-[200px]" />
              {Number(pedidoMinimo) > 0 && (
                <p className="text-[0.75rem] text-muted-foreground">
                  Los clientes no podrán confirmar pedidos menores a {formatPrice(Number(pedidoMinimo))}.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* WhatsApp */}
        <Card className="shadow-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Notificaciones WhatsApp</CardTitle>
            <p className="text-[0.82rem] text-muted-foreground leading-relaxed">
              Cuando un cliente confirma un pedido, se envía un mensaje automático a los números configurados a través de{' '}
              <strong>Callmebot</strong> (gratuito). La misma API key global se usa también para notificar a los clientes
              (cancelaciones y fechas de visita) salvo que el cliente tenga su propia key configurada.
            </p>
            <a
              href="https://www.callmebot.com/blog/free-api-whatsapp-messages/"
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[0.82rem] text-azul font-semibold hover:underline"
            >
              Activar Callmebot para un número <ExternalLink size={12} />
            </a>
          </CardHeader>
          <CardContent>
            {destinos.length === 0 && (
              <p className="text-sm text-muted-foreground italic mb-3">Sin destinos configurados.</p>
            )}

            {destinos.map(d => (
              <div key={d.numero} className="border border-border rounded-lg p-3 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-bold text-sm">+{d.numero}</span>
                  <Button variant="ghost" size="sm" onClick={() => removeDestino(d.numero)} className="h-6 px-2 text-xs text-muted-foreground hover:text-danger gap-1">
                    <X size={11} /> Quitar
                  </Button>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-[0.68rem] uppercase tracking-wider text-muted-foreground">API Key Callmebot</Label>
                  <Input
                    placeholder="Ej: 1234567  (vacío = modo fallback)"
                    value={d.apikey}
                    onChange={e => updateApikey(d.numero, e.target.value)}
                    className="h-8 text-sm"
                  />
                  {!d.apikey && (
                    <p className="text-[0.68rem] text-warning">
                      Sin API key: el mensaje abrirá WhatsApp en el dispositivo del cliente.
                    </p>
                  )}
                </div>
              </div>
            ))}

            {/* API key global de fallback para notificaciones a clientes */}
            <div className="border border-border rounded-lg p-3 mb-3 bg-cream/40">
              <Label className="text-[0.68rem] uppercase tracking-wider text-muted-foreground font-bold block mb-1.5">
                API Key global (fallback para notificaciones a clientes)
              </Label>
              <Input
                placeholder="Ej: 1234567"
                value={apikeyGlobal}
                onChange={e => setApikeyGlobal(e.target.value)}
                className="h-8 text-sm"
              />
              <p className="text-[0.68rem] text-muted-foreground mt-1.5 leading-relaxed">
                Se usa cuando un cliente no tiene su propia API key configurada.
                Para activar: el cliente debe enviar <strong>"I allow callmebot to send me messages"</strong> al{' '}
                <strong>+34 644 59 79 23</strong> por WhatsApp y recibirá su API key.
              </p>
            </div>

            {/* Add new */}
            <div className="border border-dashed border-border rounded-lg p-3">
              <p className="text-[0.72rem] font-bold uppercase tracking-wider text-muted-foreground mb-2">+ Agregar número</p>
              <div className="space-y-2">
                <Input
                  placeholder="Número (ej: 5491187654321)"
                  value={newDest.numero}
                  onChange={e => setNewDest(p => ({ ...p, numero: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && addDestino()}
                  className="h-8 text-sm"
                />
                <div className="flex gap-2">
                  <Input
                    placeholder="API Key Callmebot (opcional)"
                    value={newDest.apikey}
                    onChange={e => setNewDest(p => ({ ...p, apikey: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addDestino()}
                    className="h-8 text-sm flex-1"
                  />
                  <Button variant="outline" size="sm" onClick={addDestino} className="gap-1 h-8 text-xs shrink-0">
                    <Plus size={12} /> Agregar
                  </Button>
                </div>
                <p className="text-[0.68rem] text-muted-foreground">Formato: código país + código área + número sin espacios ni +</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button
          onClick={handleSave}
          disabled={saving}
          className={`gap-2 ${saved ? 'bg-green-700 hover:bg-green-700' : 'bg-negro text-white hover:bg-negro/90'}`}
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
          {saved ? 'Guardado' : saving ? 'Guardando…' : 'Guardar configuración'}
        </Button>
      </div>
    </AdminLayout>
  )
}
