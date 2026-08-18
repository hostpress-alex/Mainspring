import React from 'react'
import ReactDOM from 'react-dom/client'
import {BrowserRouter as Router} from 'react-router-dom'
import {Provider} from 'react-redux'
import {store} from './store/store'
import {RootCmp} from './root-cmp'
import './assets/styles/main.scss'
// Icon font. Resolves to Pro or free depending on what is installed —
// see vendor/README.md and the alias in vite.config.js.
import 'app-icons'
import {APP_TITLE} from './constants/app'

// index.html carries a placeholder; the real name lives in constants/app.js.
document.title = APP_TITLE

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <Provider store={store}>
        <Router>
            <RootCmp/>
        </Router>
    </Provider>
)

