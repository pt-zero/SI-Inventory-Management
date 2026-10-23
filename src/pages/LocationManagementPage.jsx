import { useState } from 'react';
import { MapPin, Pencil, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.jsx';
import { alert, confirm } from '@/components/custom/dialogs.jsx';
import { request, useInventoryData } from '../contexts/InventoryDataContext.jsx';

const EMPTY_FORM = { name: '', code: '', type: 'Warehouse' };
const LOCATION_TYPES = ['Warehouse', 'Carrier Hub', 'Returns'];

function LocationManagementPage() {
  const { locations, reload, setError } = useInventoryData();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingLocationId, setEditingLocationId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    try {
      await request('/locations', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm(EMPTY_FORM);
      await reload();
    } catch (requestError) {
      setError(requestError.message || 'Unable to add location.');
    }
  }

  function startEditing(location) {
    setEditingLocationId(location.id);
    setEditForm({
      name: location.name,
      code: location.code,
      type: location.type,
    });
  }

  async function handleUpdate(event, location) {
    event.preventDefault();
    setError('');
    setSavingId(location.id);

    try {
      await request(`/locations/${location.id}`, {
        method: 'PUT',
        body: JSON.stringify(editForm),
      });
      setEditingLocationId(null);
      setEditForm(EMPTY_FORM);
      await reload();
    } catch (requestError) {
      setError(requestError.message || 'Unable to update location.');
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(location) {
    const confirmed = await confirm(
      `Delete ${location.name}?\nLocations with assigned inventory cannot be deleted.`,
      {
        title: 'Confirm Location Deletion',
        variant: 'warning',
        okButtonProps: { text: 'Delete' },
        cancelButtonProps: { text: 'Cancel' },
      },
    );
    if (!confirmed) return;

    setError('');
    setDeletingId(location.id);
    try {
      await request(`/locations/${location.id}`, { method: 'DELETE' });
      await reload();
      await alert(`Location ${location.name} has been deleted.`, {
        title: 'Location Deleted',
        variant: 'info',
      });
    } catch (requestError) {
      setError(requestError.message || 'Unable to delete location.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="management-page">
      <div className="page-heading">
        <p className="eyebrow">Administration</p>
        <h1><MapPin aria-hidden="true" />Location Management</h1>
        <p>Manage warehouses, carrier hubs, and returns locations.</p>
      </div>

      <div className="management-grid">
        <Card className="panel management-list">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">Directory</p>
              <h3>Locations <span className="count-badge">{locations.length}</span></h3>
            </div>
          </div>
          {locations.length ? (
            <div className="mini-list">
              {locations.map((location) => (
                <article key={location.id} className="mini-card">
                  <div className="resource-title">
                    <strong>
                      {location.name}&emsp;
                      <span className="resource-code">{location.code}</span>
                    </strong>
                    <div className="resource-actions">
                      <Button
                        variant="outline"
                        size="icon"
                        type="button"
                        onClick={() => startEditing(location)}
                        disabled={savingId === location.id || deletingId === location.id}
                        aria-label={`Edit ${location.name}`}
                        title="Edit location"
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon"
                        type="button"
                        onClick={() => handleDelete(location)}
                        disabled={savingId === location.id || deletingId === location.id}
                        aria-label={`Delete ${location.name}`}
                        title="Delete location"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  {editingLocationId === location.id ? (
                    <form className="location-edit-form" onSubmit={(event) => handleUpdate(event, location)}>
                      <label>
                        Location name
                        <Input
                          value={editForm.name}
                          required
                          maxLength={200}
                          onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                        />
                      </label>
                      <label>
                        Location code
                        <Input
                          value={editForm.code}
                          required
                          maxLength={80}
                          onChange={(event) => setEditForm((current) => ({ ...current, code: event.target.value }))}
                        />
                      </label>
                      <label>
                        Type
                        <Select
                          value={editForm.type}
                          onValueChange={(type) => setEditForm((current) => ({ ...current, type }))}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent position="popper">
                            {LOCATION_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                      <div className="resource-actions">
                        <Button type="submit" size="sm" disabled={savingId === location.id}>
                          <Save />{savingId === location.id ? 'Saving…' : 'Save'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingLocationId(null)}
                          disabled={savingId === location.id}
                        >
                          <X />Cancel
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <span>{location.type}</span>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No locations have been added.</p>
          )}
        </Card>

        <Card className="panel management-form">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">New location</p>
              <h3>Add a location</h3>
            </div>
          </div>
          <form className="stack-form" onSubmit={handleSubmit}>
            <label>
              Location name
              <Input value={form.name} required onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label>
              Location code
              <Input value={form.code} required onChange={(event) => setForm({ ...form, code: event.target.value })} />
            </label>
            <label>
              Type
              <Select
                value={form.type}
                onValueChange={(type) => setForm((current) => ({ ...current, type }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="Warehouse">Warehouse</SelectItem>
                  <SelectItem value="Carrier Hub">Carrier Hub</SelectItem>
                  <SelectItem value="Returns">Returns</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <Button type="submit" style={{ marginTop: '1rem' }}>
              Add location
            </Button>
          </form>
        </Card>
      </div>
    </section>
  );
}

export default LocationManagementPage;
