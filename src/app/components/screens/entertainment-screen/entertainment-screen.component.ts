import { Component } from '@angular/core';
import { CostDetailComponent } from '../cost-detail/cost-detail.component';

@Component({
  selector: 'app-entertainment-screen',
  standalone: true,
  imports: [CostDetailComponent],
  template: `<app-cost-detail costKey="entertainment" />`,
})
export class EntertainmentScreenComponent {}
