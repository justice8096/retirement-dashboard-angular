import { Component } from '@angular/core';
import { CostDetailComponent } from '../cost-detail/cost-detail.component';

@Component({
  selector: 'app-groceries-screen',
  standalone: true,
  imports: [CostDetailComponent],
  template: `<app-cost-detail costKey="groceries" />`,
})
export class GroceriesScreenComponent {}
