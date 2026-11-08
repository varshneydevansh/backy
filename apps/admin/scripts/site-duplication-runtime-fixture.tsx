/** Actual Sites workspace against canonical handlers in an owned disposable demo service. */
import React from 'react';
import {createRoot} from 'react-dom/client';
import {createRootRoute,createRouter,Outlet,RouterProvider} from '@tanstack/react-router';
import {Route as SitesRoute} from '../src/routes/sites';
import {useAuthStore} from '../src/stores/authStore';
import {useStore} from '../src/stores/mockStore';
import {clearUserPermissionsCache} from '../src/lib/adminContentApi';
const restricted=sessionStorage.getItem('duplication-proof-role')==='restricted';
clearUserPermissionsCache();
useAuthStore.setState({user:{id:restricted?'duplication-synthetic-scoped':'duplication-synthetic-owner',email:'operator@fixture.invalid',fullName:'Synthetic duplication operator',role:restricted?'admin':'owner'},session:null,isLoading:false});
useStore.setState({sites:[],pages:[],posts:[]});
await fetch('/fixture/login?mode='+(restricted?'restricted':'owner'),{method:'POST'});
const root=createRootRoute({component:()=> <main className="p-6"><aside className="mb-4 border p-3 text-sm">Actual Sites UI and canonical handlers, shared authorization, owned durable demo disk. Synthetic {restricted?'scoped':'owner'} session. PostgreSQL acceptance is separate; no real provider proof.<button className="ml-3 border p-2" onClick={async()=>{sessionStorage.setItem('duplication-proof-role',restricted?'owner':'restricted');await fetch('/fixture/login?mode='+(restricted?'owner':'restricted'),{method:'POST'});location.reload();}}>Use {restricted?'owner':'scoped operator'}</button><a className="ml-3 underline" href="/fixture/evidence" target="_blank">Saved graph evidence</a></aside><Outlet/></main>});
const sites=SitesRoute.update({getParentRoute:()=>root,path:'/sites'} as any);
createRoot(document.getElementById('root')!).render(<RouterProvider router={createRouter({routeTree:root.addChildren([sites])})}/>);
