import Sidebar from './Sidebar.svelte';
import { mount } from 'svelte';

const app = mount(Sidebar, {
  target: document.getElementById('app')!,
});

export default app;
