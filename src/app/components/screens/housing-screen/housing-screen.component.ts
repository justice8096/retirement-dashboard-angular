import { Component } from '@angular/core';
import { CostDetailComponent } from '../cost-detail/cost-detail.component';

@Component({
  selector: 'app-housing-screen',
  standalone: true,
  imports: [CostDetailComponent],
  template: `<app-cost-detail costKey="rent" />`,
})
export class HousingScreenComponent {}
