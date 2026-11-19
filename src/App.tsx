import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// التخطيط الرئيسي والمصادقة
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './features/auth/LoginPage';

// الصفحات
import { DashboardPage } from './features/dashboard/DashboardPage';
import { CashierPage } from './features/cashier/CashierPage';
import { ItemsListPage } from './features/items/ItemsListPage';
import { ItemDetailPage } from './features/items/ItemDetailPage';
import { AddPurchasePage } from './features/purchase/AddPurchasePage';
import { InvoicesListPage } from './features/invoices/InvoicesListPage';
import { InvoiceDetailPage } from './features/invoices/InvoiceDetailPage';
import { CustomersListPage } from './features/customers/CustomersListPage';
import { CustomerDetailPage } from './features/customers/CustomerDetailPage';
import { TransactionsPage } from './features/transactions/TransactionsPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { SnapshotPage } from './features/snapshot/SnapshotPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { BackupPage } from './features/settings/BackupPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* صفحة تسجيل الدخول */}
        <Route path="/login" element={<LoginPage />} />

        {/* الواجهة الرئيسية والمسارات المحمية */}
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/cashier" element={<CashierPage />} />
          <Route path="/items" element={<ItemsListPage />} />
          <Route path="/items/:id" element={<ItemDetailPage />} />
          <Route path="/purchase" element={<AddPurchasePage />} />
          <Route path="/invoices" element={<InvoicesListPage />} />
          <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
          <Route path="/customers" element={<CustomersListPage />} />
          <Route path="/customers/:id" element={<CustomerDetailPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/snapshot" element={<SnapshotPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/backup" element={<BackupPage />} />
        </Route>

        {/* إعادة التوجيه التلقائي لأي مسار غير معرّف */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
