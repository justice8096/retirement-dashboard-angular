import { Component } from '@angular/core';
import { CostDetailComponent } from '../cost-detail/cost-detail.component';

@Component({
  selector: 'app-personalcare-screen',
  standalone: true,
  imports: [CostDetailComponent],
  template: `<app-cost-detail costKey="personalCare" />`,
})
export class PersonalcareScreenComponent {}
