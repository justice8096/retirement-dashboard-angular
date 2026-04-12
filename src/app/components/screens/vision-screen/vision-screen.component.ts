import { Component } from '@angular/core';
import { CostDetailComponent } from '../cost-detail/cost-detail.component';

@Component({
  selector: 'app-vision-screen',
  standalone: true,
  imports: [CostDetailComponent],
  template: `<app-cost-detail costKey="healthcare" />`,
})
export class VisionScreenComponent {}
