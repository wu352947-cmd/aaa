import { MainBuilding } from './buildings/MainBuilding'
import { Observatory } from './buildings/Observatory'
import { ArtsHall } from './buildings/ArtsHall'
import { ClockTower } from './buildings/ClockTower'
import { CurvedBuilding } from './buildings/CurvedBuilding'
import { Canteen, CampusWall, Dorms, Gate, Library, PlannedScience } from './buildings/OtherBuildings'
import { Ground } from './Ground'
import { Sports } from './Sports'
import { Plaza } from './Plaza'
import { Vegetation } from './Vegetation'
import { Surroundings } from './Surroundings'
import { FlagAnimator } from './Flags'
import { BanyanBenches, People } from './Props'

export function Campus({ people = true }: { people?: boolean }) {
  return (
    <group>
      <FlagAnimator />
      <Ground />
      <MainBuilding />
      <Observatory />
      <ArtsHall />
      <ClockTower />
      <CurvedBuilding />
      <Canteen />
      <Library />
      <Dorms />
      <PlannedScience />
      <Gate />
      <CampusWall />
      <Plaza />
      <Sports />
      <Vegetation />
      {people && <People />}
      <BanyanBenches />
      <Surroundings />
    </group>
  )
}
