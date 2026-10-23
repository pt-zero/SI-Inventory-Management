import { useState } from 'react';
import { Boxes, Eye, EyeOff, Pencil, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Select, SelectValue, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/select.jsx';
import { alert, confirm } from '@/components/custom/dialogs.jsx';
import { request, useInventoryData } from '../contexts/InventoryDataContext.jsx';

const EMPTY_FORM = { name: '', contact_name: '', email: '', password: '', status: 'active' };
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
  const { vendors, reload, setError } = useInventoryData();
  const [form, setForm] = useState(EMPTY_FORM);
  const [createEmailInvalid, setCreateEmailInvalid] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [editingVendorId, setEditingVendorId] = useState(null);
  const [contactForm, setContactForm] = useState({ contact_name: '', email: '', password: '' });
  const [contactEmailInvalid, setContactEmailInvalid] = useState(false);
  const [savingContactId, setSavingContactId] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!emailRegex.test(form.email.trim())) {
      setCreateEmailInvalid(true);
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
                  </div>
                  {editingVendorId === vendor.id ? (
                    <form className="vendor-contact-edit" onSubmit={(event) => handleContactSave(event, vendor)}>
                      <label>
                        Contact name
                        <Input
                          value={contactForm.contact_name}
                          required
                          maxLength={200}
                          onChange={(event) => setContactForm((current) => ({
                            ...current,
                            contact_name: event.target.value,
                          }))}
                        />
                      </label>
                      <label>
                        Contact email
                        <Input
                          type="email"
                          value={contactForm.email}
                          required
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
                      </label>
                      <label>
                        New password
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
                        <small className="field-hint">Leave blank to keep the current password. If entered, use 6–128 characters.</small>
                      </label>
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
            <label>
              Vendor name
              <Input value={form.name} required onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label>
              Contact name
              <Input value={form.contact_name} required onChange={(event) => setForm({ ...form, contact_name: event.target.value })} />
            </label>
            <label>
              Contact email
              <Input
                type="email"
                value={form.email}
                required
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
            </label>
            <label>
              Initial password 
              <PasswordInput
                value={form.password}
                required
                minLength={6}
                maxLength={128}
                autoComplete="new-password"
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
              <small className="field-hint">At least 6 characters. This creates the vendor’s Firebase sign-in account.</small>
            </label>

            <label>
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
            </label>
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
