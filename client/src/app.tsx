import React from 'react';
import { Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import SocialAccounts from './pages/social-accounts';
import SocialAnalytics from './pages/social-analytics';
import AccountPosts from './pages/social-analytics/account-posts';
import SocialPublish from './pages/social-publish';
import PublishEditor from './pages/social-publish/publish-editor';
import SocialMaterials from './pages/social-materials';
import NotFound from './pages/NotFound/NotFound';

const RoutesComponent = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<SocialAnalytics />} />
        <Route path="accounts" element={<SocialAccounts />} />
        <Route path="publish" element={<SocialPublish />} />
        <Route path="publish/new" element={<PublishEditor />} />
        <Route path="publish/:id" element={<PublishEditor />} />
        <Route path="materials" element={<SocialMaterials />} />
        <Route path="analytics/:accountId" element={<AccountPosts />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default RoutesComponent;
