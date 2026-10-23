import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge.jsx';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import { alert, confirm } from '@/components/custom/dialogs.jsx';
import {
  Package,
  Pencil,
  Pause,
  Search,
  Trash2,
  TriangleAlert,
  Truck,
  Users,
  Notebook,
} from 'lucide-react';
import { request, useInventoryData } from '../contexts/InventoryDataContext.jsx';
import StatCard from '@/components/ui/StatCard.jsx';

const EMPTY_FORM = {
  sku: '',
  title: '',
  category: '',
  quantity: 0,
  status: 'In Stock',
  vendor_id: '',
  location_id: '',
  intake_date: new Date().toISOString().slice(0, 10),
  shipment_status: 'Not Started',
  notes: '',
};

function InventoryPage() {
  const { user, inventory, vendors, locations, summary, setError, reload } = useInventoryData();
  const [itemForm, setItemForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [notesItem, setNotesItem] = useState(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [shippingStatusFilter, setShippingStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const isAdmin = user?.role === 'admin';
  const isVendor = user?.role === 'vendor';
  const isLowQuantity = itemForm.quantity !== '' && Number(itemForm.quantity) < 10;

  function filterLowStock() {
    const isSelected = statusFilter === 'Low Stock' && shippingStatusFilter === 'all';
    setStatusFilter(isSelected ? 'all' : 'Low Stock');
    setShippingStatusFilter('all');
  }

  function filterInTransit() {
    const isSelected = shippingStatusFilter === 'In Transit' && statusFilter === 'all';
    setShippingStatusFilter(isSelected ? 'all' : 'In Transit');
    setStatusFilter('all');
  }

  function clearInventoryFilters() {
    setStatusFilter('all');
    setShippingStatusFilter('all');
    setSearchQuery('');
  }

  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchesShippingStatus = shippingStatusFilter === 'all'
        || item.shipment_status === shippingStatusFilter;
      const haystack = `${item.title} ${item.sku} ${item.vendor_name || ''}`.toLowerCase();
      const matchesQuery = !searchQuery || haystack.includes(searchQuery.toLowerCase());
      return matchesStatus && matchesShippingStatus && matchesQuery;
    });
  }, [inventory, statusFilter, shippingStatusFilter, searchQuery]);

  async function handleSaveInventory(event) {
    event.preventDefault();
    setError('');

    try {
      const payload = {
        ...itemForm,
        quantity: Number(itemForm.quantity),
        vendor_id: isVendor ? (user?.vendor_id ?? '') : (itemForm.vendor_id || (user?.vendor_id ?? '')),
      };

      if (editingId) {
        await request(`/inventory/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await request('/inventory', { method: 'POST', body: JSON.stringify(payload) });
      }

      setItemForm(EMPTY_FORM);
      setEditingId(null);
      setIsFormOpen(false);
      await reload();
    } catch (saveError) {
      setError(saveError.message || 'Unable to save inventory item.');
    }
  }

  function startEditing(item) {
    setEditingId(item.id);
    setIsFormOpen(true);
    setItemForm({
      sku: item.sku,
      title: item.title,
      category: item.category,
      quantity: item.quantity,
      status: item.status,
      vendor_id: item.vendor_id || '',
      location_id: item.location_id || '',
      intake_date: item.intake_date,
      shipment_status: item.shipment_status,
      notes: item.notes || '',
    });
  }

  function toggleItemForm() {
    if (isFormOpen) {
      setIsFormOpen(false);
      setEditingId(null);
      setItemForm(EMPTY_FORM);
      return;
    }

    setEditingId(null);
    setItemForm(EMPTY_FORM);
    setIsFormOpen(true);
  }

  function openNotes(item) {
    setNotesItem(item);
    setNotesDraft(item.notes || '');
    setIsEditingNotes(false);
  }

  async function saveNotes(event) {
    event.preventDefault();
    if (!notesItem) return;

    setIsSavingNotes(true);
    setError('');
    try {
      await request(`/inventory/${notesItem.id}`, {
        method: 'PUT',
        body: JSON.stringify({ notes: notesDraft }),
      });
      await reload();
      setNotesItem(null);
    } catch (saveError) {
      setError(saveError.message || 'Unable to save inventory notes.');
    } finally {
      setIsSavingNotes(false);
    }
  }

  async function handleDeleteInventory(item) {
    const confirmed = await confirm(
      `Delete inventory item ${item.title} (${item.sku})?`,
      {
        title: 'Confirm Inventory Deletion',
        variant: 'warning',
        okButtonProps: { text: 'Delete' },
        cancelButtonProps: { text: 'Cancel' },
      },
    );
    if (!confirmed) return;

    setError('');
    setDeletingId(item.id);
    try {
      await request(`/inventory/${item.id}`, { method: 'DELETE' });
      await reload();
      await alert(`Inventory item ${item.title} has been deleted.`, {
        title: 'Inventory Item Deleted',
        variant: 'info',
      });
    } catch (requestError) {
      setError(requestError.message || 'Unable to delete inventory item.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
        <section className="cards-row">
          <StatCard
            label="Total Items"
            value={summary.totalItems}
            tone="primary"
            icon={Package}
            onClick={clearInventoryFilters}
            isActive={statusFilter === 'all' && shippingStatusFilter === 'all' && !searchQuery}
          />
          <StatCard
            label="Low Stock"
            value={summary.lowStock}
            tone="warning"
            icon={TriangleAlert}
            onClick={filterLowStock}
            isActive={statusFilter === 'Low Stock' && shippingStatusFilter === 'all'}
          />
          <StatCard
            label="In Transit"
            value={summary.inTransit}
            tone="accent"
            icon={Truck}
            onClick={filterInTransit}
            isActive={shippingStatusFilter === 'In Transit' && statusFilter === 'all'}
          />
          {isAdmin && (
            <>
              <StatCard label="Active Vendors" value={summary.activeVendors} tone="neutral" icon={Users} />
              <StatCard label="Paused Vendors" value={summary.pausedVendors} tone="warning" icon={Pause} />
            </>
          )}
        </section>

        <section className="content-grid inventory-form-closed">
          <Card className="panel inventory-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Operations</p>
                <h3>Inventory Records</h3>
              </div>
              <div className="panel-tools">
                {!isFormOpen && (
                  <Button type="button" variant="outline" onClick={toggleItemForm}>
                    Add Item
                  </Button>
                )}

                <Select value={shippingStatusFilter} onValueChange={setShippingStatusFilter}>
                  <SelectTrigger className="inventory-filter-select" aria-label="Filter by shipping status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="all">All Shipping Statuses</SelectItem>
                    <SelectItem value="Not Started">Not Started</SelectItem>
                    <SelectItem value="Received">Received</SelectItem>
                    <SelectItem value="In Transit">In Transit</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="inventory-filter-select" aria-label="Filter by status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="all">All Item Statuses</SelectItem>
                    <SelectItem value="In Stock">In Stock</SelectItem>
                    <SelectItem value="Low Stock">Low Stock</SelectItem>
                    <SelectItem value="Reserved">Reserved</SelectItem>
                    <SelectItem value="Out of Stock">Out of Stock</SelectItem>
                  </SelectContent>
                </Select>
                
                <div className="search-field">
                  <Search aria-hidden="true" />
                  <Input value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search SKU or Item" aria-label="Search inventory"
                  />
                </div>
              
              </div>
            </div>

            <div className="table-wrap">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead style={{ textAlign: 'center' }}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInventory.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.sku}</TableCell>
                      <TableCell>
                        <div className="item-title">
                          <strong>{item.title}</strong>
                          <span>{item.shipment_status}</span>
                        </div>
                      </TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{item.status}</Badge>
                      </TableCell>
                      <TableCell>{item.location_name || 'Unassigned'}</TableCell>
                      <TableCell>{item.vendor_name || '—'}</TableCell>
                      <TableCell style={{ textAlign: 'center' }}>
                        <div>
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={() => openNotes(item)}
                            aria-label={`View notes for ${item.title}`}
                          >
                            <Notebook />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button" 
                            onClick={() => startEditing(item)} aria-label={`Edit ${item.title}`}
                          >
                            <Pencil />
                          </Button>
                          &nbsp;&nbsp;
                          <Button
                            variant="destructive" 
                            size="sm" 
                            type="button" 
                            onClick={() => handleDeleteInventory(item)}
                            disabled={deletingId === item.id}
                            aria-label={`Delete ${item.title}`}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </section>

        {isFormOpen && (
          <div
            className="notes-dialog-overlay"
            onKeyDown={(event) => {
              if (event.key === 'Escape') toggleItemForm();
            }}
          >
          <Card
            className="panel form-panel inventory-form-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-form-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel-header compact">
              <div>
                <p className="eyebrow" style={{ textAlign: 'center' }}>
                  {editingId ? 'Edit record' : 'New record'}
                </p>
                <h3 id="inventory-form-title">
                  {editingId ? 'Update inventory item' : 'Create inventory item'}
                </h3>
              </div>
            </div>

            <form className="inventory-form" onSubmit={handleSaveInventory}>
              <label>
                SKU
                <Input value={itemForm.sku} onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })} />
              </label>
              <label>
                Title
                <Input value={itemForm.title} onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })} />
              </label>
              <div className="double-field">
                <label>
                  Category
                  <Input value={itemForm.category} onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })} />
                </label>
                <label>
                  Quantity
                  <Input
                    type="number"
                    min="0"
                    value={itemForm.quantity}
                    onChange={(event) => {
                      const quantity = event.target.value;
                      setItemForm((current) => ({
                        ...current,
                        quantity,
                        ...(quantity !== '' && Number(quantity) < 10 ? { status: 'Low Stock' } : {}),
                      }));
                    }}
                  />
                </label>
              </div>
              <div className="double-field">
                <label>
                  Status
                  <Select
                    value={isLowQuantity ? 'Low Stock' : itemForm.status}
                    onValueChange={(status) => setItemForm((current) => ({ ...current, status }))}
                  >
                    <SelectTrigger className="w-full" disabled={isLowQuantity}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" className="inventory-form-select-content">
                      <SelectItem value="In Stock">In Stock</SelectItem>
                      <SelectItem value="Low Stock">Low Stock</SelectItem>
                      <SelectItem value="Reserved">Reserved</SelectItem>
                      <SelectItem value="Out of Stock">Out of Stock</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label>
                  Intake Date
                  <Input type="date" value={itemForm.intake_date} onChange={(e) => setItemForm({ ...itemForm, intake_date: e.target.value })} />
                </label>
              </div>
              <div className="double-field">
                <label>
                  Vendor
                  {isVendor ? (
                    <span className="vendor-assignment-text">
                      {vendors.find((vendor) => String(vendor.id) === String(user?.vendor_id))?.name
                        || user?.vendor_name
                        || `Vendor ${user?.vendor_id}`}
                    </span>
                  ) : (
                    <Select
                      value={itemForm.vendor_id ? String(itemForm.vendor_id) : 'unassigned'}
                      onValueChange={(vendorId) => setItemForm((current) => ({
                        ...current,
                        vendor_id: vendorId === 'unassigned' ? '' : vendorId,
                      }))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select Vendor" />
                      </SelectTrigger>
                      <SelectContent position="popper" className="inventory-form-select-content">
                        <SelectItem value="unassigned">Select Vendor</SelectItem>
                        {vendors.map((vendor) => (
                          <SelectItem key={vendor.id} value={String(vendor.id)}>{vendor.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </label>
                <label>
                  Location
                  <Select
                    value={itemForm.location_id ? String(itemForm.location_id) : 'unassigned'}
                    onValueChange={(locationId) => setItemForm((current) => ({
                      ...current,
                      location_id: locationId === 'unassigned' ? '' : locationId,
                    }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select Location" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="inventory-form-select-content">
                      <SelectItem value="unassigned">Select Location</SelectItem>
                      {locations.map((location) => (
                        <SelectItem key={location.id} value={String(location.id)}>{location.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>
              <label>
                Shipment status
                <Select
                  value={itemForm.shipment_status}
                  onValueChange={(shipment_status) => setItemForm((current) => ({
                    ...current,
                    shipment_status,
                  }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" className="inventory-form-select-content">
                    <SelectItem value="Not Started">Not Started</SelectItem>
                    <SelectItem value="Received">Received</SelectItem>
                    <SelectItem value="In Transit">In Transit</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label>
                Notes
                <Textarea rows="4" value={itemForm.notes} onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })} />
              </label>

              <div className="action-row inventory-form-actions">
                <Button variant="outline" type="button"
                  onClick={() => { 
                    setEditingId(null);
                    setItemForm(EMPTY_FORM); 
                  }}>
                  Clear
                </Button>
                <Button type="button" variant="outline" onClick={toggleItemForm}>
                  Cancel
                </Button>
                <Button type="submit" className="primary-button">
                  {editingId ? 'Update' : 'Add'}
                </Button>
              </div>
            </form>
          </Card>
          </div>
        )}

        {notesItem && (
          <div
            className="notes-dialog-overlay"
            onClick={() => setNotesItem(null)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setNotesItem(null);
            }}
          >
            <section
              className="notes-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="inventory-notes-title"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="notes-dialog-header">
                <div>
                  <p className="eyebrow">{isEditingNotes ? 'Edit notes' : 'Inventory notes'}</p>
                  <h3 id="inventory-notes-title">{notesItem.title}</h3>
                </div>
                <Button type="button" variant="ghost" onClick={() => setNotesItem(null)}>
                  Close
                </Button>
              </header>
              {isEditingNotes ? (
                <form onSubmit={saveNotes}>
                  <Textarea
                    autoFocus
                    rows={6}
                    maxLength={4000}
                    value={notesDraft}
                    onChange={(event) => setNotesDraft(event.target.value)}
                    aria-label={`Notes for ${notesItem.title}`}
                  />
                  <br></br>
                  <div className="action-row notes-dialog-actions">
                    <Button type="submit" disabled={isSavingNotes}>
                      {isSavingNotes ? 'Saving...' : 'Save notes'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSavingNotes}
                      onClick={() => {
                        setNotesDraft(notesItem.notes || '');
                        setIsEditingNotes(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="notes-dialog-content">
                    {notesItem.notes || 'No notes have been added for this item.'}
                  </p>
                  <footer className="notes-dialog-actions">
                    <Button type="button" onClick={() => setIsEditingNotes(true)}>
                      Edit
                    </Button>
                  </footer>
                </>
              )}
            </section>
          </div>
        )}

    </>
  );
}

export default InventoryPage;
