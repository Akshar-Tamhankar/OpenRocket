import math
import csv

class RocketCalculations:

    def __init__(self, dry_mass, fuel_mass, thrust, isp, burn_time=None, g = 9.81):
        self.dry_mass = dry_mass
        self.fuel_mass = fuel_mass
        self.thrust = thrust
        self.isp = isp
        self.burn_time = burn_time
        self.g = g

    def exhaust_velocity(self):
        return self.isp * self.g
    
    def mass_flow_rate(self): 
        return self.thrust / self.exhaust_velocity()
    
    def calculate_burn_time(self): 
        if (self.burn_time is None):
            return self.fuel_mass / self.mass_flow_rate()
        return self.burn_time
    
    def delta_v(self):
        ve = self.exhaust_velocity()
        m0 = self.dry_mass + self.fuel_mass
        mf = self.dry_mass
        return ve * math.log(m0 / mf)
    
    def summary(self):
        burn_time = self.calculate_burn_time()
        mass_flow = self.mass_flow_rate()
        ve = self.exhaust_velocity()
        dv = self.delta_v()

        return {
            "Dry Mass (kg)": self.dry_mass,
            "Fuel Mass (kg)": self.fuel_mass,
            "Thrust (N)": self.thrust,
            "Specific Impulse (s)": self.isp,
            "Burn Time (s)": self.burn_time(),
            "Mass Flow Rate (kg/s)": self.mass_flow_rate(),
            "Exhaust Velocity (m/s)": self.exhaust_velocity(),
            "Delta-V (m/s)": self.delta_v()
        }
    
    def save_to_csv(self, filename="data.csv"):
        summary = self.summary()

        with open(filename, 'w', newline="") as file:
            writer = csv.writer(file)
            writer.writerow(["Metric", "Value"])
            for key, value in summary.items():
                writer.writerow([key, value])

        print(f"Summary saved to {filename}")

def get_input(prompt, min_value=0, optional=False):
    while True:
        try:
            value = input(prompt)
            if optional and value.strip() == "":
                return None
            value = float(value)
            if value < min_value:
                print(f"Value must be >= {min_value}.")
                continue
            return value
        except ValueError:
            print("Invalid input. Enter a number.")

def main():
    print("=== Rocket Performance Analyzer Version 1 ===")
    dry_mass = get_input("Enter dry mass (kg): ")
    fuel_mass = get_input("Enter fuel mass (kg): ")
    thrust = get_input("Enter thrust (N): ")
    isp = get_input("Enter specific impulse (s): ")
    burn_time = get_input("Enter burn time (s) [press enter to calculate]: ", optional=True)

    rocket = RocketCalculations(dry_mass, fuel_mass, thrust, isp, burn_time)
    summary = rocket.summary()

    print("\n--- Rocket Performance Summary ---")
    for key, value in summary.items():
        print(f"{key}: {value}")

    rocket.save_to_csv()

if __name__ == "__main__":
    main()