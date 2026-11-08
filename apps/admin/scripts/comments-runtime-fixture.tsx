/** Actual Comments route mounted only in the owned acceptance service. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { createRootRoute,createRouter,Outlet,RouterProvider } from '@tanstack/react-router';
import { Route as CommentsRoute } from '../src/routes/comments';
import { useAuthStore } from '../src/stores/authStore';
import { useStore } from '../src/stores/mockStore';
import { clearUserPermissionsCache } from '../src/lib/adminContentApi';
import { Header } from '../src/components/layout/Header';
clearUserPermissionsCache();
useAuthStore.setState({user:{id:'synthetic-comments-owner',email:'owner@fixture.invalid',fullName:'Synthetic owner',role:'owner'},session:null,isLoading:false});
useStore.setState({sites:[{id:'site-demo',name:'Owned comments acceptance',slug:'site-demo',isPublished:true} as any],comments:[],pages:[],posts:[]});
const root=createRootRoute({component:()=> <><Header sidebarCollapsed={false} mobileSidebarOpen={false} onSidebarToggle={()=>{}}/><main className="p-6"><aside className="mb-4 border p-2 text-sm">Actual admin UI and handlers with durable owned demo storage. Synthetic operator login; no real email/provider proof. <button className="ml-2 border p-1" onClick={async()=>{await fetch('/fixture/report',{method:'POST'});location.reload();}}>Submit public report</button><button className="ml-2 border p-1" onClick={()=>fetch('/fixture/fail-delivery',{method:'POST'})}>Fail owned webhook</button></aside><Outlet/></main></>});
const comments=CommentsRoute.update({getParentRoute:()=>root,path:'/comments'} as any);
await fetch('/fixture/login',{method:'POST'});
createRoot(document.getElementById('root')!).render(<RouterProvider router={createRouter({routeTree:root.addChildren([comments])})}/>);
