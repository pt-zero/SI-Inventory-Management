import { useEffect, useState } from 'react';
import { Eye, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Select, SelectValue, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/select.jsx';
import { alert, confirm } from '@/components/custom/dialogs.jsx';
import { request, useInventoryData } from '../contexts/InventoryDataContext.jsx';

const EMPTY_FORM = { name: '', email: '', password: '' };

function getEmailDomain(email) {
  const atIndex = email?.lastIndexOf('@') ?? -1;
  return atIndex > -1 && atIndex < email.length - 1
    ? email.slice(atIndex + 1).trim().toLowerCase()
    : '';
}

function UserManagementPage() {
  const { user, vendors, reload, setError } = useInventoryData();
  const isAdmin = user?.role === 'admin';
  const [filterVendorId, setFilterVendorId] = useState('all');
  const [assignedVendorId, setAssignedVendorId] = useState('');
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const assignedVendor = vendors.find((vendor) => String(vendor.id) === String(isAdmin ? assignedVendorId : user?.vendor_id));
  const requiredDomain = assignedVendor?.email ? getEmailDomain(assignedVendor.email) : '';
  const emailDomainInvalid = requiredDomain && form.email && getEmailDomain(form.email) !== requiredDomain;

  async function loadUsers(selectedVendorId = filterVendorId) {
    setLoadingUsers(true);
    try {
      const path = isAdmin && selectedVendorId !== 'all'
        ? `/users?vendor_id=${selectedVendorId}`
        : '/users';
      setUsers(await request(path));
    } catch (requestError) {
      setError(requestError.message || 'Unable to load vendor users.');
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, [filterVendorId]);

  async function handleSubmit(event) {
    event.preventDefault();
    const selectedVendorId = isAdmin ? assignedVendorId : user?.vendor_id;
    if (!selectedVendorId) {
      setError('Select a vendor before creating a user.');
      return;
    }
    if (emailDomainInvalid) {
      setError(`View-only user email must use the vendor domain @${requiredDomain}.`);
      return;
    }
    setCreating(true);
    setError('');
    try {
      await request('/users', {
        method: 'POST',
        body: JSON.stringify({ ...form, vendor_id: selectedVendorId }),
      });
      setForm(EMPTY_FORM);
      await loadUsers(selectedVendorId);
      await reload();
    } catch (requestError) {
      setError(requestError.message || 'Unable to create vendor user.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(vendorUser) {
    const confirmed = await confirm(`Delete view-only access for ${vendorUser.name}?`, {
      title: 'Confirm User Deletion',
      variant: 'warning',
      okButtonProps: { text: 'Delete' },
      cancelButtonProps: { text: 'Cancel' },
    });
    if (!confirmed) return;
    setDeletingId(vendorUser.id);
    setError('');
    try {
      await request(`/users/${vendorUser.id}`, { method: 'DELETE' });
      await loadUsers();
      await alert(`${vendorUser.name}'s access has been deleted.`, {
        title: 'User Deleted',
        variant: 'info',
      });
    } catch (requestError) {
      setError(requestError.message || 'Unable to delete vendor user.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="management-page">
      <div className="page-heading">
        <p className="eyebrow">Access Management</p>
        <h1><UserPlus aria-hidden="true" />Vendor Users</h1>
        <p>Create view-only users for your assigned inventory</p>
      </div>

      {isAdmin && (
        <label className="user-vendor-filter">
          Vendor
          <Select value={filterVendorId} onValueChange={setFilterVendorId}>
            <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="all">All vendors</SelectItem>
              {vendors.map((vendor) => (
                <SelectItem key={vendor.id} value={String(vendor.id)}>{vendor.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      )}

      <div className="management-grid">
        <Card className="panel management-list">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">View-only accounts</p>
              <h3>Users <span className="count-badge">{users.length}</span></h3>
            </div>
          </div>
          {loadingUsers ? (
            <p className="empty-state">Loading users...</p>
          ) : users.length ? (
            <div className="mini-list">
              {users.map((vendorUser) => (
                <article key={vendorUser.id} className="mini-card">
                  <div>
                    <div className="resource-title">
                      <strong>{vendorUser.name}</strong>
                      <span className="readonly-badge"><Eye /> View only</span>
                    </div>
                    <small>{vendorUser.email}</small>
                    {vendorUser.created_by_name && <small>Created by {vendorUser.created_by_name}</small>}
                  </div>
                  <Button
                    variant="destructive"
                    size="icon"
                    type="button"
                    onClick={() => handleDelete(vendorUser)}
                    disabled={deletingId === vendorUser.id}
                    aria-label={`Delete ${vendorUser.name}`}
                  >
                    <Trash2 />
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No view-only users have been added.</p>
          )}
        </Card>

        <Card className="panel management-form">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">New user</p>
              <h3>Add view-only access</h3>
            </div>
          </div>
          <form className="stack-form" onSubmit={handleSubmit}>
            {isAdmin && (
              <label>
                Assigned vendor
                <Select value={assignedVendorId} onValueChange={setAssignedVendorId}>
                  <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent position="popper">
                    {vendors.map((vendor) => (
                      <SelectItem key={vendor.id} value={String(vendor.id)}>{vendor.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            )}
            <label>
              Name
              <Input 
                required 
                value={form.name} 
                onChange={(event) => setForm({ ...form, name: event.target.value })} 
              />
            </label>
            <label>
              Email
              <Input 
                required 
                type="email"
                value={form.email} 
                onChange={(event) => setForm({ ...form, email: event.target.value })} 
              />
              {requiredDomain && (
                <small className={emailDomainInvalid ? 'field-error' : 'field-hint'}>
                  {emailDomainInvalid ? 'Email must use ' : 'Required email domain: '}@{requiredDomain}
                </small>
              )}
            </label>
            <label>
              Initial password
              <Input 
                required 
                type="password" 
                minLength={6} 
                maxLength={128} 
                autoComplete="new-password" 
                value={form.password} 
                onChange={(event) => setForm({ ...form, password: event.target.value })} 
              />
            </label>
            <Button 
              type="submit" 
              disabled={creating || emailDomainInvalid || (!isAdmin && !user?.vendor_id) || (isAdmin && !assignedVendorId)}
            >
              {creating ? 'Creating account…' : 'Add user'}
            </Button>
          </form>
        </Card>
      </div>
    </section>
  );
}

export default UserManagementPage;
