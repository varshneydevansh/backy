/** Actual operational routes in the disposable Forms acceptance service. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { createRootRoute,createRouter,Link,Outlet,RouterProvider } from '@tanstack/react-router';
import { Route as FormsRoute } from '../src/routes/forms';
import { Route as ContactsRoute } from '../src/routes/contacts';
import { useAuthStore } from '../src/stores/authStore';
import { useStore } from '../src/stores/mockStore';
import { clearUserPermissionsCache } from '../src/lib/adminContentApi';
clearUserPermissionsCache();
const restricted=sessionStorage.getItem('forms-proof-role')==='restricted';
useAuthStore.setState({user:{id:restricted?'forms-synthetic-scoped':'forms-synthetic-owner',email:'operator@fixture.invalid',fullName:'Synthetic Forms operator',role:restricted?'admin':'owner'},session:null,isLoading:false});
useStore.setState({sites:[{id:'forms-acceptance',name:'Owned Forms acceptance',slug:'forms-acceptance',isPublished:true},{id:'forms-denied',name:'Other isolated site',slug:'forms-denied',isPublished:true}] as any,pages:[],posts:[]});
const root=createRootRoute({component:()=> <main className="p-6"><aside className="mb-4 border p-2 text-sm">Actual Forms/Contacts UI and handlers with owned durable demo disk + shared auth. Synthetic {restricted?'site-scoped':'owner'} session; no real provider proof. <Link to="/forms" search={{siteId:'forms-acceptance'}} className="ml-3 underline">Forms</Link><Link to="/contacts" search={{siteId:'forms-acceptance'}} className="ml-3 underline">Contacts</Link><button className="ml-3 border p-1" onClick={async()=>{sessionStorage.setItem('forms-proof-role','restricted');await fetch('/fixture/login?mode=restricted',{method:'POST'});location.reload();}}>Use scoped operator</button></aside><Outlet/></main>});
const forms=FormsRoute.update({getParentRoute:()=>root,path:'/forms'} as any),contacts=ContactsRoute.update({getParentRoute:()=>root,path:'/contacts'} as any);
await fetch('/fixture/login?mode='+(restricted?'restricted':'owner'),{method:'POST'});
createRoot(document.getElementById('root')!).render(<RouterProvider router={createRouter({routeTree:root.addChildren([forms,contacts])})}/>);
