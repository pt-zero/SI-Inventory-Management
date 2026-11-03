import { useState } from 'react';
import { Boxes, Eye, EyeOff, MapPin, Pencil, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Select, SelectValue, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/select.jsx';
import { Checkbox } from '@/components/ui/checkbox.jsx';
import { Label } from '@/components/ui/label.jsx';
import { alert, confirm } from '@/components/custom/dialogs.jsx';
import { request, useInventoryData } from '../contexts/InventoryDataContext.jsx';

const EMPTY_FORM = { name: '', contact_name: '', email: '', password: '', status: 'active', location_ids: [] };
const emailRegex = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/;

function PasswordInput({ value, onChange, ...props }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-input-wrapper">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        className="password-input"
      />
      <button
        className="password-visibility-toggle"
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
    </div>
  );
}

function VendorManagementPage() {
  const { vendors, locations, reload, setError } = useInventoryData();
  const [form, setForm] = useState(EMPTY_FORM);
  const [createEmailInvalid, setCreateEmailInvalid] = useState(false);
  const [createLocationInvalid, setCreateLocationInvalid] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [editingVendorId, setEditingVendorId] = useState(null);
  const [contactForm, setContactForm] = useState({ contact_name: '', email: '', password: '' });
  const [contactEmailInvalid, setContactEmailInvalid] = useState(false);
  const [savingContactId, setSavingContactId] = useState(null);
  const [locationVendorId, setLocationVendorId] = useState(null);
  const [selectedLocationIds, setSelectedLocationIds] = useState([]);
  const [savingLocationsId, setSavingLocationsId] = useState(null);
  const [assignedLocationInvalid, setAssignedLocationInvalid] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!emailRegex.test(form.email.trim())) {
      setCreateEmailInvalid(true);
      return;
    }
    if (form.location_ids.length === 0) {
      setCreateLocationInvalid(true);
      return;
    }
    setError('');
    setCreating(true);

    try {
      await request('/vendors', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm(EMPTY_FORM);
      setCreateEmailInvalid(false);
      setCreateLocationInvalid(false);
      await reload();
    } catch (requestError) {
      setError(requestError.message || 'Unable to add vendor.');
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(vendor, status) {
    setError('');
    setUpdatingStatusId(vendor.id);

    try {
      await request(`/vendors/${vendor.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      await reload();
    } catch (requestError) {
      setError(requestError.message || 'Unable to update vendor status.');
    } finally {
      setUpdatingStatusId(null);
    }
  }

  function startEditingContact(vendor) {
    setEditingVendorId(vendor.id);
    setContactForm({
      contact_name: vendor.contact_name || '',
      email: vendor.email || '',
      password: '',
    });
    setContactEmailInvalid(false);
  }

  async function handleContactSave(event, vendor) {
    event.preventDefault();
    if (!emailRegex.test(contactForm.email.trim())) {
      setContactEmailInvalid(true);
      return;
    }
    setError('');
    setSavingContactId(vendor.id);

    try {
      await request(`/vendors/${vendor.id}/contact`, {
        method: 'PUT',
        body: JSON.stringify(contactForm),
      });
      setContactForm({ contact_name: '', email: '', password: '' });
      setContactEmailInvalid(false);
      setEditingVendorId(null);
      await reload();
    } catch (requestError) {
      setError(requestError.message || 'Unable to update vendor contact.');
    } finally {
      setSavingContactId(null);
    }
  }

  async function handleDelete(vendor) {
    const confirmed = await confirm(
      `Delete ${vendor.name} and its Firebase sign-in account?\nVendors with assigned inventory cannot be deleted.`,
      {
        title: 'Confirm Vendor Deletion',
        variant: 'warning',
        okButtonProps: { text: 'Delete' },
        cancelButtonProps: { text: 'Cancel' },
      },
    );
    if (!confirmed) return;

    setError('');
    setDeletingId(vendor.id);
    let cleanupWarning = false;
    try {
      const result = await request(`/vendors/${vendor.id}`, { method: 'DELETE' });
      if (result.cleanupWarning) {
        cleanupWarning = true;
        setError(result.message);
      }

      await reload();
      if (!cleanupWarning) {
        await alert(`Vendor ${vendor.name} has been deleted.`, {
          title: 'Vendor Deleted',
          variant: 'info',
        });
      }
    } catch (requestError) {
      setError(requestError.message || 'Unable to delete vendor.');
    } finally {
      setDeletingId(null);
    }
  }

  function startEditingLocations(vendor) {
    setLocationVendorId(vendor.id);
    setSelectedLocationIds(vendor.location_ids || []);
    setAssignedLocationInvalid(false);
  }

  function toggleAllLocations(selected) {
    setSelectedLocationIds(selected ? locations.map((location) => location.id) : []);
    if (selected) setAssignedLocationInvalid(false);
  }

  function toggleAllCreateLocations(selected) {
    setForm((current) => ({
      ...current,
      location_ids: selected ? locations.map((location) => location.id) : [],
    }));
    if (selected) setCreateLocationInvalid(false);
  }

  async function saveVendorLocations(vendorId) {
    if (selectedLocationIds.length === 0) {
      setAssignedLocationInvalid(true);
      return;
    }
    setAssignedLocationInvalid(false);
    setSavingLocationsId(vendorId);
    setError('');
    try {
      await request(`/vendors/${vendorId}/locations`, {
        method: 'PUT',
        body: JSON.stringify({ location_ids: selectedLocationIds }),
      });
      setLocationVendorId(null);
      await reload();
    } catch (requestError) {
      setError(requestError.message || 'Unable to assign vendor locations.');
    } finally {
      setSavingLocationsId(null);
    }
  }

  return (
    <section className="management-page">
      <div className="page-heading">
        <p className="eyebrow">Administration</p>
        <h1><Boxes aria-hidden="true" />Vendor Management</h1>
        <p>Manage vendor contacts and account status.</p>
      </div>

      <div className="management-grid">
        <Card className="panel management-list">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">Directory</p>
              <h3>Vendors <span className="count-badge">{vendors.length}</span></h3>
            </div>
          </div>
          {vendors.length ? (
            <div className="mini-list">
              {vendors.map((vendor) => (
                <article key={vendor.id} className="mini-card">
                  <div className="resource-title">
                    <strong>{vendor.name}</strong>
                    <div className="resource-actions">
                      <Select
                        value={vendor.status}
                        onValueChange={(status) => handleStatusChange(vendor, status)}
                      >
                        <SelectTrigger
                          className="resource-status-select"
                          disabled={updatingStatusId === vendor.id || deletingId === vendor.id || savingContactId === vendor.id}
                          aria-label={`Status for ${vendor.name}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="paused">Paused</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="icon"
                        type="button"
                        onClick={() => startEditingContact(vendor)}
                        disabled={deletingId === vendor.id || updatingStatusId === vendor.id || savingContactId === vendor.id}
                        aria-label={`Edit contact for ${vendor.name}`}
                        title="Edit contact"
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        type="button"
                        onClick={() => startEditingLocations(vendor)}
                        aria-label={`Assign locations for ${vendor.name}`}
                        title="Assign locations"
                      >
                        <MapPin />
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon"
                        type="button"
                        onClick={() => handleDelete(vendor)}
                        disabled={deletingId === vendor.id || updatingStatusId === vendor.id || savingContactId === vendor.id}
                        aria-label={`Delete ${vendor.name}`}
                        title="Delete vendor"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    {locationVendorId === vendor.id && (
                      <form className="vendor-contact-edit" onSubmit={(event) => {
                        event.preventDefault();
                        saveVendorLocations(vendor.id);
                      }}>
                        <strong>Assigned locations</strong>
                        {assignedLocationInvalid && (
                          <small className="field-hint field-error" role="alert">
                            At least one location must be assigned.
                          </small>
                        )}
                        {locations.length > 0 && (
                          <Label className="location-checkbox location-select-all">
                            <Checkbox
                              checked={locations.every((location) => selectedLocationIds.includes(location.id))}
                              onCheckedChange={(checked) => toggleAllLocations(checked === true)}
                            />
                            Select all
                          </Label>
                        )}
                        {locations.map((location) => (
                          <Label key={location.id} className="location-checkbox">
                            <Checkbox
                              checked={selectedLocationIds.includes(location.id)}
                              onCheckedChange={(checked) => setSelectedLocationIds((current) => {
                                const nextIds = checked === true
                                  ? [...current, location.id]
                                  : current.filter((id) => id !== location.id);
                                if (nextIds.length > 0) setAssignedLocationInvalid(false);
                                return nextIds;
                              })}
                            />
                            {location.name}
                          </Label>
                        ))}
                        <div className="resource-actions">
                          <Button type="submit" size="sm" disabled={savingLocationsId === vendor.id}>
                            <Save />Save locations
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => setLocationVendorId(null)}>
                            <X />Cancel
                          </Button>
                        </div>
                      </form>
                    )}
                  </div>
                  {editingVendorId === vendor.id ? (
                    <form className="vendor-contact-edit" onSubmit={(event) => handleContactSave(event, vendor)}>
                      <Label>
                        Contact Name
                        <Input
                          required
                          value={contactForm.contact_name}
                          maxLength={200}
                          onChange={(event) => setContactForm((current) => ({
                            ...current,
                            contact_name: event.target.value,
                          }))}
                        />
                      </Label>
                      <Label>
                        Contact Email
                        <Input
                          required
                          type="email"
                          value={contactForm.email}
                          maxLength={320}
                          aria-invalid={contactEmailInvalid}
                          aria-describedby={contactEmailInvalid ? `vendor-email-error-${vendor.id}` : undefined}
                          onChange={(event) => setContactForm((current) => ({
                            ...current,
                            email: event.target.value,
                          }))}
                          onBlur={(event) => setContactEmailInvalid(!emailRegex.test(event.target.value.trim()))}
                        />
                        {contactEmailInvalid ? (
                          <small className="field-error" id={`vendor-email-error-${vendor.id}`}>
                            Enter a valid email address.
                          </small>
                        ) : null}
                      </Label>
                      <Label>
                        New Password
                        <PasswordInput
                          value={contactForm.password}
                          minLength={6}
                          maxLength={128}
                          autoComplete="new-password"
                          onChange={(event) => setContactForm((current) => ({
                            ...current,
                            password: event.target.value,
                          }))}
                        />
                        <small className="field-hint">
                          Leave blank to keep the current password. If entered, use 6–128 characters.
                        </small>
                      </Label>
                      <div className="resource-actions">
                        <Button type="submit" size="sm" disabled={savingContactId === vendor.id}>
                          <Save />{savingContactId === vendor.id ? 'Saving…' : 'Save'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingVendorId(null);
                            setContactEmailInvalid(false);
                          }}
                          disabled={savingContactId === vendor.id}
                        >
                          <X />Cancel
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <span>{vendor.contact_name || 'No contact name'}</span>
                      <small>{vendor.email || 'No contact email'}</small>
                    </>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No vendors have been added.</p>
          )}
        </Card>

        <Card className="panel management-form">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">
                New vendor
              </p>
              <h3>Add a vendor</h3>
            </div>
          </div>
          <form className="stack-form" onSubmit={handleSubmit}>
            <Label>
              Vendor Name
              <Input
                required 
                value={form.name} 
                onChange={
                  (event) => setForm({ ...form, name: event.target.value })
                } 
              />
            </Label>
            <Label>
              Contact Name
              <Input
                required 
                value={form.contact_name}
                onChange={
                  (event) => setForm({ ...form, contact_name: event.target.value })
                }
              />
            </Label>
            <Label>
              Contact Email
              <Input
                required
                type="email"
                value={form.email}
                aria-invalid={form.email && createEmailInvalid}
                aria-describedby={createEmailInvalid ? 'new-vendor-email-error' : undefined}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                onBlur={(event) => setCreateEmailInvalid(!emailRegex.test(event.target.value.trim()))}
              />
              {form.email && createEmailInvalid ? (
                <small className="field-error" id="new-vendor-email-error">
                  Enter a valid email address.
                </small>
              ) : null}
            </Label>
            <Label>
              Initial Password 
              <PasswordInput
                required
                value={form.password}
                minLength={6}
                maxLength={128}
                autoComplete="new-password"
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
              <small className="field-hint">At least 6 characters. This creates the vendor’s Firebase sign-in account.</small>
            </Label>
            <Label>
              Status
              <Select
                className="w-full"
                value={form.status}
                onValueChange={(status) => setForm((current) => ({ ...current, status }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                </SelectContent>
              </Select>
            </Label>
            <br></br>
            <hr></hr>
            <fieldset className="location-checkbox-group">
              <legend>Assigned Locations</legend>
              {locations.length > 0 && (
                <Label className="location-checkbox location-select-all">
                  <Checkbox
                    checked={locations.every((location) => form.location_ids.includes(location.id))}
                    onCheckedChange={(checked) => toggleAllCreateLocations(checked === true)}
                  />
                  Select all
                </Label>
              )}
              {locations.length ? locations.map((location) => (
                <Label key={location.id} className="location-checkbox">
                  <Checkbox
                    checked={form.location_ids.includes(location.id)}
                    onCheckedChange={(checked) => setForm((current) => {
                      const locationIds = checked === true
                        ? [...current.location_ids, location.id]
                        : current.location_ids.filter((id) => id !== location.id);
                      if (locationIds.length > 0) setCreateLocationInvalid(false);
                      return { ...current, location_ids: locationIds };
                    })}
                  />
                  {location.name}
                </Label>
              )) : (
                <small className="field-hint">No locations are available.</small>
              )}
              {createLocationInvalid && (
                <small className="field-hint field-error" role="alert">
                  At least one location must be assigned.
                </small>
              )}
            </fieldset>
            <Button type="submit" disabled={creating} style={{ marginTop: '1rem' }}>
              {creating ? 'Creating account…' : 'Add vendor'}
            </Button>
          </form>
        </Card>
      </div>
    </section>
  );
}

export default VendorManagementPage;
