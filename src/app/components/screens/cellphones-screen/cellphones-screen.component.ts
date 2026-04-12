import { Component } from '@angular/core';
import { CostDetailComponent } from '../cost-detail/cost-detail.component';

@Component({
  selector: 'app-cellphones-screen',
  standalone: true,
  imports: [CostDetailComponent],
  template: `<app-cost-detail costKey="phoneCell" />`,
})
export class CellphonesScreenComponent {}
