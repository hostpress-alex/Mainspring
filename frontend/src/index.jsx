import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter as Router } from 'react-router-dom'
import { Provider } from 'react-redux'
import { store } from './store/store'
import { RootCmp } from './root-cmp'
import './assets/styles/main.scss'
import { GoogleOAuthProvider } from '@react-oauth/google';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <GoogleOAuthProvider clientId="206331273095-es5eep8nfovokr5vilsalpr8gnqsfdut.apps.googleusercontent.com">
    <Provider store={store}>
      <Router>
        <RootCmp />
      </Router>
    </Provider>
  </GoogleOAuthProvider>
)

